# Valida la TOPOLOGIA DE DESPLIEGUE: el servidor SSR como unica puerta publica, reenviando
# /api y /uploads a la API.
#
# Existe porque este hueco estuvo abierto hasta la Fase 11 sin que nadie lo viera: el resto de
# scripts habla con la API directamente (5282) y con el HTML servido —cuyas llamadas salen del
# servidor con URL absoluta—, asi que ninguno ejercitaba el camino del NAVEGADOR. En
# produccion eso significaba login, favoritos, consultas, chat y fotos muertos.
#
# Requiere `dotnet build` y `npx ng build` previos.
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$pad = Join-Path $env:TEMP 'rentca-proxy-logs'
New-Item -ItemType Directory -Force -Path $pad | Out-Null
$jar = Join-Path $pad 'cookies.txt'
Remove-Item $jar -ErrorAction SilentlyContinue

$bin = Join-Path $repo 'src\Rent.Api\bin\Debug\net9.0'
$cli = Join-Path $repo 'src\rent-client'
$api_url = 'http://localhost:5282'
$ssr_url = 'http://localhost:4000'
$azure_host = 'rent-ca-net-ng.azurewebsites.net'

$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:ASPNETCORE_URLS = $api_url
$api = Start-Process dotnet -ArgumentList 'Rent.Api.dll' -WorkingDirectory $bin -PassThru -NoNewWindow `
  -RedirectStandardOutput "$pad\api.log" -RedirectStandardError "$pad\api.err.log"
for ($i = 0; $i -lt 40; $i++) {
  try { if ((Invoke-WebRequest "$api_url/health" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200) { break } } catch {}
  Start-Sleep -Seconds 2
}

# El host permitido se pasa por entorno, como en el App Service.
$env:PORT = '4000'
$env:API_BASE_URL = $api_url
$env:ALLOWED_HOSTS = $azure_host
$ssr = Start-Process node -ArgumentList 'dist\rent-client\server\server.mjs' -WorkingDirectory $cli -PassThru -NoNewWindow `
  -RedirectStandardOutput "$pad\ssr.log" -RedirectStandardError "$pad\ssr.err.log"
for ($i = 0; $i -lt 30; $i++) {
  try { Invoke-WebRequest "$ssr_url/en" -UseBasicParsing -TimeoutSec 5 | Out-Null; break } catch {}
  Start-Sleep -Seconds 2
}

# La API sigue sembrando un rato despues de responder /health; el proxy daria 504 si se le
# pregunta antes de tiempo.
for ($i = 0; $i -lt 20; $i++) {
  if ((curl.exe -s -o NUL -w '%{http_code}' "$ssr_url/api/home") -eq '200') { break }
  Start-Sleep -Seconds 2
}

$results = [System.Collections.Generic.List[object]]::new()
function Check($name, $ok, $detail) {
  $results.Add([pscustomobject]@{ Prueba = $name; Estado = $(if ($ok) { 'OK' } else { 'FALLA' }); Detalle = $detail })
}

function Token {
  $line = Select-String -Path $jar -Pattern 'XSRF-TOKEN' | Select-Object -Last 1
  if (-not $line) { return '' }
  return ($line.Line -split "`t")[-1]
}

# 1) Las rutas de la API se reenvian con la URL INTACTA (montarlas con prefijo la recortaria).
$homeCode = curl.exe -s -o NUL -w '%{http_code}' "$ssr_url/api/home"
$homeType = curl.exe -s -o NUL -w '%{content_type}' "$ssr_url/api/home"
Check 'La API se reenvia por el SSR' ($homeCode -eq '200' -and $homeType -match 'application/json') "/api/home -> $homeCode $homeType"

# 2) Una ruta de la API que no existe devuelve el 404 de la API, no el HTML de Angular.
#    Se fuerza a cadena: un 404 sin cuerpo no imprime content-type, y con la salida vacia
#    PowerShell devuelve un array — y `-notmatch` sobre un array vacio evalua a FALSO.
$missingCode = [string](curl.exe -s -o NUL -w '%{http_code}' "$ssr_url/api/no-existe")
$missingType = [string](curl.exe -s -o NUL -w '%{content_type}' "$ssr_url/api/no-existe")
Check 'Un 404 de API no cae en el renderer' (
  $missingCode -eq '404' -and $missingType -notmatch 'text/html'
) "$missingCode content-type='$missingType'"

# 3) Set-Cookie llega SIN atributo Domain: asi la cookie queda ligada al host que ve el
#    navegador (el del SSR). Reescribirla la dejaria fuera de alcance y no habria sesion.
$headers = (curl.exe -s -D - -c $jar -o NUL "$ssr_url/api/auth/csrf") -split "`n"
$cookieLines = @($headers | Where-Object { $_ -match 'set-cookie' })
Check 'La cookie pasa sin reescribir dominio' (
  $cookieLines.Count -ge 2 -and -not ($cookieLines -match 'domain=')
) "cookies=$($cookieLines.Count)"

# 4) Sesion completa por el proxy: login, identidad y endpoint protegido.
$loginFile = Join-Path $pad 'login.json'
@{ email = 'admin@rent.local'; password = 'Admin123!'; rememberMe = $false } |
  ConvertTo-Json -Compress | Set-Content -Path $loginFile -Encoding utf8 -NoNewline
$login = curl.exe -s -b $jar -c $jar -X POST -H 'Content-Type: application/json' `
  -H "X-XSRF-TOKEN: $(Token)" -d "@$loginFile" "$ssr_url/api/auth/login"
curl.exe -s -b $jar -c $jar -o NUL "$ssr_url/api/auth/csrf"
$me = curl.exe -s -b $jar "$ssr_url/api/auth/me" | ConvertFrom-Json
$adminCode = curl.exe -s -b $jar -o NUL -w '%{http_code}' "$ssr_url/api/admin/dashboard"
Check 'La sesion sobrevive al proxy' (
  $login -match '"redirectPath":"/admin"' -and $me.user.email -eq 'admin@rent.local' -and $adminCode -eq '200'
) "me=$($me.user.email) admin=$adminCode"

# 5) El chat responde por SSE a traves del proxy (el caso que descubrio el agujero).
$chatFile = Join-Path $pad 'chat.json'
@{
  conversationId = $null; message = 'Prueba por el proxy'; locale = 'en'
  context = @{ currentPage = '/en'; currentCity = $null; currentPropertyId = $null }
} | ConvertTo-Json -Compress -Depth 6 | Set-Content -Path $chatFile -Encoding utf8 -NoNewline
$sse = (curl.exe -s -b $jar -c $jar -X POST -H 'Content-Type: application/json' `
    -H "X-XSRF-TOKEN: $(Token)" -d "@$chatFile" "$ssr_url/api/ai/chat") -join "`n"
Check 'El chat funciona por el proxy' ($sse -match 'event: message' -and $sse -match 'event: done') 'SSE completo'

# 6) Las fotos subidas se sirven por el mismo camino.
$uploadsCode = curl.exe -s -o NUL -w '%{http_code}' "$ssr_url/uploads/no-existe.png"
Check 'La ruta de fotos se reenvia' ($uploadsCode -eq '404') "un 404 de la API, no HTML: $uploadsCode"

# 7) allowedHosts: el dominio de despliegue entra y uno ajeno se rechaza (proteccion SSRF).
$allowed = curl.exe -s -o NUL -w '%{http_code}' -H "Host: $azure_host" "$ssr_url/en"
$rejected = curl.exe -s -o NUL -w '%{http_code}' -H 'Host: evil.example.com' "$ssr_url/en"
Check 'El host de despliegue se acepta' ($allowed -eq '200') "$azure_host -> $allowed"
Check 'Un host ajeno se rechaza' ($rejected -eq '400') "evil.example.com -> $rejected"

# 8) Cache del SSR (PRP 12.3). Lo que se comprueba no es la velocidad: es que una pagina
#    PERSONAL no acabe nunca en una cache compartida.
#    Se usa una URL con query propia porque el arranque del script ya pidio /en y esa entrada
#    esta caliente.
$probe = "/en/about?cachecheck=$([guid]::NewGuid().ToString('N'))"
$first = [string](curl.exe -s -o NUL -w '%{header_json}' "$ssr_url$probe")
$second = [string](curl.exe -s -o NUL -w '%{header_json}' "$ssr_url$probe")
Check 'La primera visita renderiza y la segunda sale de cache' (
  $first -match '"x-ssr-cache":\["miss"\]' -and $second -match '"x-ssr-cache":\["hit"\]'
) 'miss -> hit'

# La misma URL con la cookie de tema claro es OTRA entrada: el servidor pinta el HTML segun
# ella, y compartir la entrada serviria la pagina oscura a quien pidio la clara.
$light = [string](curl.exe -s -o NUL -w '%{header_json}' -H 'Cookie: rentca-theme=light' "$ssr_url$probe")
Check 'El tema no comparte entrada de cache' ($light -match '"x-ssr-cache":\["miss"\]') 'claro y oscuro por separado'

# Con sesion NO se cachea: el HTML lleva el nombre del usuario y sus favoritos.
# El header pinta `fullName || email`, y el admin sembrado se llama "Site Admin": buscar su
# correo daria un falso verde, porque no aparece nunca.
$authed = [string](curl.exe -s -b $jar -o NUL -w '%{header_json}' "$ssr_url$probe")
$authedHtml = (curl.exe -s -b $jar "$ssr_url/en") -join "`n"
Check 'Una peticion con sesion no toca la cache' (
  $authed -notmatch '"x-ssr-cache"' -and $authedHtml -match 'Site Admin'
) 'sin cabecera de cache y con el usuario dentro'

# Y despues de todo lo anterior, un anonimo sigue viendo la version anonima: si la peticion
# identificada hubiera contaminado la entrada, aqui apareceria el nombre del administrador.
$anonHtml = (curl.exe -s "$ssr_url/en") -join "`n"
Check 'La sesion no se filtra a la pagina anonima' (
  $anonHtml -notmatch 'Site Admin' -and $anonHtml -match 'Sign In'
) 'anonimo sigue anonimo'

# Las zonas privadas no se cachean nunca, ni siquiera sin cookie (solo devuelven un 302).
$private = [string](curl.exe -s -o NUL -w '%{header_json}' "$ssr_url/en/renter")
Check 'Las zonas privadas quedan fuera de la cache' ($private -notmatch '"x-ssr-cache"') '/en/renter'

# 9) Cabeceras de cache de la API: publico para anonimos, nada para quien tiene sesion.
$apiAnon = [string](curl.exe -s -o NUL -w '%{header_json}' "$ssr_url/api/home")
$apiAuth = [string](curl.exe -s -b $jar -o NUL -w '%{header_json}' "$ssr_url/api/home")
Check 'La API se cachea solo para anonimos' (
  $apiAnon -match 'public, max-age=300' -and $apiAuth -match 'private, no-store'
) 'public/anonimo vs private/sesion'

$results | Format-Table -AutoSize

$failed = @($results | Where-Object { $_.Estado -eq 'FALLA' }).Count
Write-Output ''
Write-Output "=== $($results.Count - $failed)/$($results.Count) pruebas en verde ==="

if (-not $ssr.HasExited) { Stop-Process -Id $ssr.Id -Force }
if (-not $api.HasExited) { Stop-Process -Id $api.Id -Force }
Write-Output 'PROCESOS DETENIDOS'
