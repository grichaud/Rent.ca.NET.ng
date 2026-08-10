# Comprobacion de humo contra el despliegue REAL.
#
# Los scripts `validate-*.ps1` levantan la app en local; este habla con lo que hay publicado.
# Sirve para el go/no-go de un despliegue y para volver a pasarlo despues de cada publicacion:
# comprueba que el SSR renderiza, que reenvia a la API, que la sesion sobrevive al proxy, que
# el `<head>` sale con el dominio real y que la cache no mezcla anonimos con identificados.
#
# La contrasena del administrador NO va en el repo: se pasa por parametro o por la variable de
# entorno RENTCA_ADMIN_PASSWORD. Sin ella se saltan las pruebas con sesion y el resto corre.
#
#   .\scripts\verify-production.ps1
#   .\scripts\verify-production.ps1 -BaseUrl https://mi-dominio -AdminPassword '...'
param(
    [string]$BaseUrl = 'https://rent-ca-net-ng.azurewebsites.net',
    [string]$AdminEmail = 'admin@rent.local',
    [string]$AdminPassword = $env:RENTCA_ADMIN_PASSWORD
)

$ErrorActionPreference = 'Continue'
$BaseUrl = $BaseUrl.TrimEnd('/')

$pad = Join-Path $env:TEMP ("rentca-prod-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $pad | Out-Null
$jar = Join-Path $pad 'cookies.txt'

$results = [System.Collections.Generic.List[object]]::new()
function Check($name, $ok, $detail) {
    $results.Add([pscustomobject]@{ Prueba = $name; Estado = $(if ($ok) { 'OK' } else { 'FALLA' }); Detalle = $detail })
}

function Get-Html($path) { return (curl.exe -s "$BaseUrl$path") -join "`n" }
function Get-Code($path) { return [string](curl.exe -s -o NUL -w '%{http_code}' "$BaseUrl$path") }
function Get-Match($text, $pattern) { return [regex]::Match($text, $pattern).Groups[1].Value }

# --- 1. El SSR responde y sirve contenido, no un esqueleto vacio ------------------------

$homeHtml = Get-Html '/en'
Check 'La home se sirve renderizada' (
    $homeHtml.Length -gt 50000 -and ([regex]::matches($homeHtml, '<app-property-card')).Count -gt 0
) "$($homeHtml.Length) bytes, $(([regex]::matches($homeHtml, '<app-property-card')).Count) anuncios"

foreach ($path in @('/fr', '/en/toronto', '/fr/toronto', '/en/about', '/en/faq', '/en/privacy', '/en/landlords')) {
    Check "Ruta publica $path" ((Get-Code $path) -eq '200') (Get-Code $path)
}

# --- 2. El <head> de la Fase 12, con el dominio REAL ------------------------------------

$titleEn = Get-Match $homeHtml '<title[^>]*>(.*?)</title>'
$titleFr = Get-Match (Get-Html '/fr') '<title[^>]*>(.*?)</title>'
Check 'El titulo cambia con el idioma' ($titleEn -ne $titleFr -and $titleFr -match 'Trouvez') "en='$titleEn' fr='$titleFr'"

$canonical = Get-Match $homeHtml '<link[^>]*rel="canonical"[^>]*href="([^"]*)"'
Check 'El canonical usa el dominio publicado' ($canonical -eq "$BaseUrl/en") $canonical

$city = Get-Html '/en/toronto'
$langs = @([regex]::Matches($city, '<link[^>]*rel="alternate"[^>]*hreflang="([^"]*)"') | ForEach-Object { $_.Groups[1].Value })
Check 'La ciudad declara hreflang en/fr/x-default' (
    $langs -contains 'en' -and $langs -contains 'fr' -and $langs -contains 'x-default'
) ($langs -join ', ')

# --- 3. robots.txt y sitemap.xml --------------------------------------------------------

$robots = Get-Html '/robots.txt'
Check 'robots.txt anuncia el sitemap del dominio real' (
    $robots -match ([regex]::Escape("Sitemap: $BaseUrl/sitemap.xml"))
) 'linea Sitemap'

$sitemap = Get-Html '/sitemap.xml'
$locs = @([regex]::Matches($sitemap, '<loc>([^<]*)</loc>') | ForEach-Object { $_.Groups[1].Value })
Check 'El sitemap enumera URLs del dominio real' (
    $locs.Count -gt 10 -and ($locs | Where-Object { $_ -notlike "$BaseUrl/*" }).Count -eq 0
) "$($locs.Count) URLs"

# Una URL del sitemap tiene que resolver: si no, el sitemap manda al buscador a un 404.
$sample = $locs | Where-Object { ($_ -split '/').Count -ge 6 } | Select-Object -First 1
if ($sample) {
    $sampleCode = [string](curl.exe -s -o NUL -w '%{http_code}' $sample)
    Check 'Una ficha del sitemap responde 200' ($sampleCode -eq '200') "$sampleCode"
}

# --- 4. El SSR reenvia a la API ---------------------------------------------------------

$apiType = [string](curl.exe -s -o NUL -w '%{content_type}' "$BaseUrl/api/home")
Check 'El SSR reenvia /api a la API' ($apiType -match 'application/json') $apiType

$apiHeaders = [string](curl.exe -s -o NUL -w '%{header_json}' "$BaseUrl/api/home")
Check 'La API se cachea para anonimos' ($apiHeaders -match 'public, max-age=') 'Cache-Control publico'

# Las features que dependen de una clave de terceros. Aqui no se comprueba que la clave sea
# valida —eso lo dira Google o OpenRouter—, sino que el servidor la tiene: sin ella la feature
# queda apagada en silencio y nadie se entera hasta que un usuario la usa.
$mapsKey = (curl.exe -s "$BaseUrl/api/config" | ConvertFrom-Json).mapsApiKey
Check 'La clave de mapas esta configurada' (-not [string]::IsNullOrWhiteSpace($mapsKey)) `
    $(if ($mapsKey) { "presente ($($mapsKey.Length) car.)" } else { 'AUSENTE: el mapa no se pintara' })

$providers = (curl.exe -s "$BaseUrl/api/auth/me" | ConvertFrom-Json).externalProviders
Check 'El inicio de sesion con Google se anuncia' ($providers -contains 'Google') ($providers -join ', ')

# --- 5. Cache del SSR: nunca mezcla anonimo con sesion -----------------------------------

$probe = "/en/about?smoke=$([guid]::NewGuid().ToString('N'))"
$first = [string](curl.exe -s -o NUL -w '%{header_json}' "$BaseUrl$probe")
$second = [string](curl.exe -s -o NUL -w '%{header_json}' "$BaseUrl$probe")
Check 'La segunda visita sale de cache' (
    $first -match '"x-ssr-cache":\["miss"\]' -and $second -match '"x-ssr-cache":\["hit"\]'
) 'miss -> hit'

# --- 6. Sesion a traves del proxy (lo que mas se rompe en produccion) --------------------

if ([string]::IsNullOrWhiteSpace($AdminPassword)) {
    Write-Output 'AVISO: sin contrasena de administrador, se omiten las pruebas con sesion.'
} else {
    curl.exe -s -c $jar -o NUL "$BaseUrl/api/auth/csrf"
    $tokenLine = Select-String -Path $jar -Pattern 'XSRF-TOKEN' | Select-Object -Last 1
    $token = if ($tokenLine) { ($tokenLine.Line -split "`t")[-1] } else { '' }

    $loginFile = Join-Path $pad 'login.json'
    @{ email = $AdminEmail; password = $AdminPassword; rememberMe = $false } |
        ConvertTo-Json -Compress | Set-Content -Path $loginFile -Encoding utf8 -NoNewline

    $login = curl.exe -s -b $jar -c $jar -X POST -H 'Content-Type: application/json' `
        -H "X-XSRF-TOKEN: $token" -d "@$loginFile" "$BaseUrl/api/auth/login"
    curl.exe -s -b $jar -c $jar -o NUL "$BaseUrl/api/auth/csrf"

    $me = curl.exe -s -b $jar "$BaseUrl/api/auth/me" | ConvertFrom-Json
    Check 'La sesion sobrevive al proxy' ($me.user.email -eq $AdminEmail) "me=$($me.user.email)"

    $adminCode = [string](curl.exe -s -b $jar -o NUL -w '%{http_code}' "$BaseUrl/api/admin/dashboard")
    Check 'El panel de administracion responde' ($adminCode -eq '200') $adminCode

    # El HTML servido ya sale con el usuario dentro: si el SSR no prestara la cookie a sus
    # llamadas, la pagina llegaria anonima y el header parpadearia al hidratar.
    $adminHtml = (curl.exe -s -b $jar "$BaseUrl/en/admin") -join "`n"
    Check 'El SSR renderiza identificado' ($adminHtml -match 'Site Admin') 'usuario en el HTML servido'

    # Y lo mas importante: esa peticion NO puede haber tocado la cache compartida.
    $authedHeaders = [string](curl.exe -s -b $jar -o NUL -w '%{header_json}' "$BaseUrl$probe")
    $anonAgain = (curl.exe -s "$BaseUrl$probe") -join "`n"
    Check 'La sesion no contamina la cache anonima' (
        $authedHeaders -notmatch '"x-ssr-cache"' -and $anonAgain -notmatch 'Site Admin'
    ) 'anonimo sigue anonimo'
}

# --- 7. Zonas privadas ------------------------------------------------------------------

$privateCode = [string](curl.exe -s -o NUL -w '%{http_code}' "$BaseUrl/en/admin")
Check 'Sin cookie el panel rebota' ($privateCode -eq '302') $privateCode

$loginHtml = Get-Html '/en/login'
Check 'El login se marca noindex' ($loginHtml -match 'noindex') 'meta robots'

$results | Format-Table -AutoSize

$failed = @($results | Where-Object { $_.Estado -eq 'FALLA' }).Count
Write-Output ''
Write-Output "=== $($results.Count - $failed)/$($results.Count) pruebas en verde contra $BaseUrl ==="
if ($failed -gt 0) { exit 1 }
