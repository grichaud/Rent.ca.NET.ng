# Valida el SEO de la Fase 12 sobre el HTML **SERVIDO**, no sobre el DOM.
#
# Es la unica forma honesta de comprobarlo: DevTools ensena el documento ya hidratado, asi que
# un <head> que solo se construye en el navegador se veria perfecto ahi y llegaria VACIO al
# rastreador. Todo lo que sigue mira el texto crudo que devuelve el servidor.
#
# Requiere `dotnet build` y `npx ng build` previos.
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$pad = Join-Path $env:TEMP 'rentca-seo-logs'
New-Item -ItemType Directory -Force -Path $pad | Out-Null

$bin = Join-Path $repo 'src\Rent.Api\bin\Debug\net9.0'
$cli = Join-Path $repo 'src\rent-client'
$apiUrl = 'http://localhost:5282'
$ssrUrl = 'http://localhost:4000'

$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:ASPNETCORE_URLS = $apiUrl
$api = Start-Process dotnet -ArgumentList 'Rent.Api.dll' -WorkingDirectory $bin -PassThru -NoNewWindow `
  -RedirectStandardOutput "$pad\api.log" -RedirectStandardError "$pad\api.err.log"
for ($i = 0; $i -lt 40; $i++) {
  try { if ((Invoke-WebRequest "$apiUrl/health" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200) { break } } catch {}
  Start-Sleep -Seconds 2
}

$env:PORT = '4000'
$env:API_BASE_URL = $apiUrl
Remove-Item Env:\ALLOWED_HOSTS -ErrorAction SilentlyContinue
Remove-Item Env:\SITE_BASE_URL -ErrorAction SilentlyContinue
$ssr = Start-Process node -ArgumentList 'dist\rent-client\server\server.mjs' -WorkingDirectory $cli -PassThru -NoNewWindow `
  -RedirectStandardOutput "$pad\ssr.log" -RedirectStandardError "$pad\ssr.err.log"
for ($i = 0; $i -lt 30; $i++) {
  try { Invoke-WebRequest "$ssrUrl/en" -UseBasicParsing -TimeoutSec 5 | Out-Null; break } catch {}
  Start-Sleep -Seconds 2
}

# La siembra del catalogo sigue un rato despues de que /health conteste.
for ($i = 0; $i -lt 20; $i++) {
  if ((curl.exe -s -o NUL -w '%{http_code}' "$ssrUrl/api/home") -eq '200') { break }
  Start-Sleep -Seconds 2
}

$results = [System.Collections.Generic.List[object]]::new()
function Check($name, $ok, $detail) {
  $results.Add([pscustomobject]@{ Prueba = $name; Estado = $(if ($ok) { 'OK' } else { 'FALLA' }); Detalle = $detail })
}

function Get-Html($path) { return (curl.exe -s "$ssrUrl$path") -join "`n" }

function Get-Tag($html, $pattern) {
  $m = [regex]::Match($html, $pattern, 'IgnoreCase')
  if ($m.Success) { return $m.Groups[1].Value }
  return ''
}

function Get-Title($html) { return Get-Tag $html '<title[^>]*>(.*?)</title>' }
function Get-MetaName($html, $name) { return Get-Tag $html "<meta[^>]*name=`"$name`"[^>]*content=`"([^`"]*)`"" }
function Get-MetaProp($html, $prop) { return Get-Tag $html "<meta[^>]*property=`"$prop`"[^>]*content=`"([^`"]*)`"" }
function Get-Canonical($html) { return Get-Tag $html '<link[^>]*rel="canonical"[^>]*href="([^"]*)"' }

# Un listing real del catalogo sembrado: la ficha es la pagina con el <head> mas completo.
#
# OJO con los nombres: `$home` es una variable AUTOMATICA de solo lectura de PowerShell y
# asignarla mata el script a media ejecucion con un error que no se parece en nada a la causa
# (aqui dejaba `$listing` nulo y la ruta de la ficha en "/en//", que redirige).
$homeData = curl.exe -s "$ssrUrl/api/home" | ConvertFrom-Json
$sampleListing = $homeData.latestListings | Select-Object -First 1
if (-not $sampleListing) { throw 'El catalogo vino vacio: la API no ha sembrado todavia.' }
$listingPath = "/en/$($sampleListing.citySlug)/$($sampleListing.slug)"

# ---------------------------------------------------------------- 1. Titulos por ruta e idioma

$homeEn = Get-Html '/en'
$homeFr = Get-Html '/fr'
$titleEn = Get-Title $homeEn
$titleFr = Get-Title $homeFr

Check 'La home tiene titulo propio en ingles' (
  $titleEn -match 'Find Your' -and $titleEn -match 'Rent\.ca$'
) "<title>$titleEn</title>"

# La prueba que pide el PRP: si el frances devolviera el titulo ingles, el SSR no estaria
# cumpliendo su unico proposito.
Check 'La home cambia de titulo en frances' (
  $titleFr -ne $titleEn -and $titleFr -match 'Trouvez'
) "<title>$titleFr</title>"

$cityEn = Get-Html '/en/toronto'
$cityFr = Get-Html '/fr/toronto'
$cityTitleEn = Get-Title $cityEn
$cityTitleFr = Get-Title $cityFr

Check 'La ciudad titula con su nombre (en)' ($cityTitleEn -match 'Rentals in Toronto') "<title>$cityTitleEn</title>"
Check 'La ciudad titula en frances (fr)' (
  $cityTitleFr -match 'Locations' -and $cityTitleFr -match 'Toronto' -and $cityTitleFr -ne $cityTitleEn
) "<title>$cityTitleFr</title>"

$listingHtml = Get-Html $listingPath
$listingTitle = Get-Title $listingHtml
Check 'La ficha titula con el nombre del piso' (
  $listingTitle -match [regex]::Escape($sampleListing.title)
) "<title>$listingTitle</title>"

# ---------------------------------------------------------------- 2. Meta description

$descEn = Get-MetaName $homeEn 'description'
$descFr = Get-MetaName $homeFr 'description'
Check 'Hay meta description y cambia de idioma' (
  $descEn.Length -gt 50 -and $descFr.Length -gt 50 -and $descEn -ne $descFr
) "en=$($descEn.Length) car., fr=$($descFr.Length) car."

$listingDesc = Get-MetaName $listingHtml 'description'
Check 'La ficha describe el piso, no el sitio' (
  $listingDesc.Length -gt 50 -and $listingDesc -ne $descEn
) "$($listingDesc.Substring(0, [Math]::Min(60, $listingDesc.Length)))..."

# ---------------------------------------------------------------- 3. Canonical

$canonicalCity = Get-Canonical $cityEn
Check 'El canonical apunta al host publico' (
  $canonicalCity -eq "$ssrUrl/en/toronto"
) $canonicalCity

# Las combinaciones de filtros son infinitas y ensenan el mismo catalogo: todas tienen que
# canonicalizar a la ciudad limpia o competirian entre si.
$filtered = Get-Html '/en/toronto?types=Condo&maxPrice=4000'
$canonicalFiltered = Get-Canonical $filtered
Check 'El canonical descarta el query string' (
  $canonicalFiltered -eq "$ssrUrl/en/toronto"
) $canonicalFiltered

# ---------------------------------------------------------------- 4. hreflang

$altEn = [regex]::Matches($cityEn, '<link[^>]*rel="alternate"[^>]*hreflang="([^"]*)"[^>]*href="([^"]*)"', 'IgnoreCase')
$langs = @($altEn | ForEach-Object { $_.Groups[1].Value })
Check 'La ciudad declara sus dos idiomas y x-default' (
  $langs -contains 'en' -and $langs -contains 'fr' -and $langs -contains 'x-default'
) "hreflang: $($langs -join ', ')"

$frAlt = @($altEn | Where-Object { $_.Groups[1].Value -eq 'fr' } | ForEach-Object { $_.Groups[2].Value })
Check 'El alternate frances apunta a la misma pagina en /fr' (
  $frAlt -contains "$ssrUrl/fr/toronto"
) ($frAlt -join ' ')

# ---------------------------------------------------------------- 5. Open Graph

$ogTitle = Get-MetaProp $listingHtml 'og:title'
$ogUrl = Get-MetaProp $listingHtml 'og:url'
$ogImage = Get-MetaProp $listingHtml 'og:image'
$ogType = Get-MetaProp $listingHtml 'og:type'

Check 'La ficha trae tarjeta Open Graph' (
  $ogTitle -match [regex]::Escape($sampleListing.title) -and $ogType -eq 'article' -and $ogUrl -eq "$ssrUrl$listingPath"
) "og:type=$ogType og:url=$ogUrl"

# Una URL relativa la ignoran en silencio: la tarjeta sale sin foto y nada lo denuncia.
Check 'La imagen social es absoluta' ($ogImage -match '^https?://') "og:image=$ogImage"

$ogLocaleFr = Get-MetaProp $homeFr 'og:locale'
Check 'og:locale sigue al idioma de la pagina' ($ogLocaleFr -eq 'fr_CA') "fr -> $ogLocaleFr"

# ---------------------------------------------------------------- 6. Datos estructurados

$jsonLdBlocks = [regex]::Matches($listingHtml, '<script type="application/ld\+json">(.*?)</script>', 'Singleline')
$jsonLdText = ($jsonLdBlocks | ForEach-Object { $_.Groups[1].Value }) -join "`n"

Check 'La ficha emite RealEstateListing' (
  $jsonLdText -match '"@type":"RealEstateListing"' -and $jsonLdText -match '"offers"'
) "$($jsonLdBlocks.Count) bloque(s) de JSON-LD"

Check 'La ficha emite BreadcrumbList' ($jsonLdText -match '"@type":"BreadcrumbList"') 'migas de pan'

# El JSON tiene que ser JSON: un texto de la BD con comillas sin escapar lo romperia y el
# buscador descartaria el bloque entero sin avisar.
$jsonLdValid = $true
foreach ($block in $jsonLdBlocks) {
  try { $block.Groups[1].Value | ConvertFrom-Json | Out-Null } catch { $jsonLdValid = $false }
}
Check 'El JSON-LD es JSON valido' $jsonLdValid 'todos los bloques parsean'

$faqHtml = Get-Html '/en/faq'
Check 'La FAQ emite FAQPage' ($faqHtml -match '"@type":"FAQPage"') 'preguntas estructuradas'

$homeJsonLd = $homeEn -match '"@type":"WebSite"' -and $homeEn -match '"@type":"Organization"'
Check 'La home declara la identidad del sitio' $homeJsonLd 'WebSite + Organization'

# ---------------------------------------------------------------- 7. Paginas que NO se indexan

$loginHtml = Get-Html '/en/login'
$loginRobots = Get-MetaName $loginHtml 'robots'
Check 'El login se marca noindex' ($loginRobots -match 'noindex') "robots=$loginRobots"
Check 'El login no declara alternates' (
  $loginHtml -notmatch 'hreflang='
) 'sin hreflang en pagina privada'

$missingCity = Get-Html '/en/ciudad-que-no-existe'
$missingRobots = Get-MetaName $missingCity 'robots'
Check 'Una ciudad inexistente se marca noindex' ($missingRobots -match 'noindex') "robots=$missingRobots"

# ---------------------------------------------------------------- 8. La landing de propietarios

$landlordsHtml = Get-Html '/en/landlords'
$landlordsTitle = Get-Title $landlordsHtml
Check 'La landing de propietarios ya no es un placeholder' (
  $landlordsTitle -match 'Landlords' -and
  $landlordsHtml -match 'List Your Property on' -and
  $landlordsHtml -match 'id="pricing"'
) "<title>$landlordsTitle</title>"

Check 'La landing muestra los tres planes' (
  $landlordsHtml -match '\$0' -and $landlordsHtml -match '\$35' -and $landlordsHtml -match '\$199'
) 'Limited / Promoted / Featured'

# Los precios son de demostracion: emitir un Offer de 35 $ que nadie puede pagar seria
# afirmarle al buscador algo que el sitio no cumple.
Check 'La landing NO estructura precios de demo' (
  $landlordsHtml -notmatch '"@type":"Offer"'
) 'sin Offer en datos estructurados'

# ---------------------------------------------------------------- 9. robots.txt

$robots = (curl.exe -s "$ssrUrl/robots.txt") -join "`n"
Check 'robots.txt anuncia el sitemap' ($robots -match "Sitemap: $([regex]::Escape($ssrUrl))/sitemap\.xml") 'linea Sitemap'
Check 'robots.txt bloquea las zonas privadas' (
  $robots -match 'Disallow: /en/admin/' -and $robots -match 'Disallow: /fr/renter/'
) 'admin, landlord y renter'

# La trampa del prefijo: `Disallow: /en/landlord` bloquearia tambien `/en/landlords`, que es
# justo la pagina comercial que mas interesa indexar.
Check 'robots.txt no bloquea /landlords por prefijo' (
  $robots -match 'Allow: /en/landlords' -and $robots -notmatch 'Disallow: /en/landlord\r?\n'
) 'la landing publica queda rastreable'

# ---------------------------------------------------------------- 10. sitemap.xml

$sitemapType = curl.exe -s -o NUL -w '%{content_type}' "$ssrUrl/sitemap.xml"
$sitemap = (curl.exe -s "$ssrUrl/sitemap.xml") -join "`n"
$locs = @([regex]::Matches($sitemap, '<loc>([^<]*)</loc>') | ForEach-Object { $_.Groups[1].Value })

Check 'sitemap.xml se sirve como XML' ($sitemapType -match 'xml') $sitemapType
Check 'El sitemap incluye los dos idiomas' (
  ($locs | Where-Object { $_ -match '/en/' }).Count -gt 0 -and
  ($locs | Where-Object { $_ -match '/fr/' }).Count -gt 0
) "$($locs.Count) URLs"

Check 'El sitemap incluye ciudades y fichas' (
  $locs -contains "$ssrUrl/en/toronto" -and $locs -contains "$ssrUrl$listingPath"
) 'toronto y la ficha de prueba'

Check 'El sitemap relaciona los idiomas con xhtml:link' (
  $sitemap -match 'xhtml:link[^>]*hreflang="fr"' -and $sitemap -match 'hreflang="x-default"'
) 'alternates dentro del sitemap'

Check 'La landing publica entra al sitemap' ($locs -contains "$ssrUrl/en/landlords") '/en/landlords'
Check 'Las zonas privadas NO entran al sitemap' (
  ($locs | Where-Object { $_ -match '/(admin|renter|login|signup)(/|$)' }).Count -eq 0
) 'sin rutas privadas'

# Un sitemap solo vale si sus URLs resuelven. Se comprueba una de cada tipo.
$sampleCode = curl.exe -s -o NUL -w '%{http_code}' ($locs | Where-Object { $_ -match '/fr/' } | Select-Object -First 1)
$listingCode = curl.exe -s -o NUL -w '%{http_code}' "$ssrUrl$listingPath"
Check 'Las URLs del sitemap responden 200' (
  $sampleCode -eq '200' -and $listingCode -eq '200'
) "fr=$sampleCode ficha=$listingCode"

# ---------------------------------------------------------------- 11. El canonical sigue a SITE_BASE_URL

# En produccion la app puede responder en varios hosts; sin un dominio fijado, cada uno se
# declararia canonico de si mismo y el buscador veria el sitio duplicado.
$forwarded = (curl.exe -s -H 'X-Forwarded-Proto: https' -H 'X-Forwarded-Host: rent-ca-net-ng.azurewebsites.net' "$ssrUrl/en/about") -join "`n"
Check 'El canonical respeta las cabeceras del proxy' (
  (Get-Canonical $forwarded) -eq 'https://rent-ca-net-ng.azurewebsites.net/en/about'
) (Get-Canonical $forwarded)

$results | Format-Table -AutoSize

$failed = @($results | Where-Object { $_.Estado -eq 'FALLA' }).Count
Write-Output ''
Write-Output "=== $($results.Count - $failed)/$($results.Count) pruebas en verde ==="

if (-not $ssr.HasExited) { Stop-Process -Id $ssr.Id -Force }
if (-not $api.HasExited) { Stop-Process -Id $api.Id -Force }
Write-Output 'PROCESOS DETENIDOS'
