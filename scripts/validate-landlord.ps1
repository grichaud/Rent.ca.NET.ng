# Valida el portal del landlord (Fase 9) sobre HTTP real: alta, crear listing con unidades,
# subir fotos por multipart, consulta entrante, inbox con toggle, perfil de marca, y el HTML
# SERVIDO de las pantallas con la cookie del visitante — incluida la ficha PUBLICA del
# listing recien creado. Mismo patron que validate-renter.ps1: curl.exe con tarro de
# cookies, nunca Invoke-WebRequest.
#
# Requiere `dotnet build` y `npx ng build` previos.
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$pad = Join-Path $env:TEMP 'rentca-landlord-logs'
New-Item -ItemType Directory -Force -Path $pad | Out-Null
$jar = Join-Path $pad 'cookies.txt'
Remove-Item $jar -ErrorAction SilentlyContinue

$bin = Join-Path $repo 'src\Rent.Api\bin\Debug\net9.0'
$cli = Join-Path $repo 'src\rent-client'
$api_url = 'http://localhost:5282'
$ssr_url = 'http://localhost:4000'

$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:ASPNETCORE_URLS = $api_url
$api = Start-Process dotnet -ArgumentList 'Rent.Api.dll' -WorkingDirectory $bin -PassThru -NoNewWindow `
  -RedirectStandardOutput "$pad\api.log" -RedirectStandardError "$pad\api.err.log"
for ($i = 0; $i -lt 40; $i++) {
  try { if ((Invoke-WebRequest "$api_url/health" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200) { break } } catch {}
  Start-Sleep -Seconds 2
}

$env:PORT = '4000'
$env:API_BASE_URL = $api_url
$ssr = Start-Process node -ArgumentList 'dist\rent-client\server\server.mjs' -WorkingDirectory $cli -PassThru -NoNewWindow `
  -RedirectStandardOutput "$pad\ssr.log" -RedirectStandardError "$pad\ssr.err.log"
for ($i = 0; $i -lt 30; $i++) {
  try { Invoke-WebRequest "$ssr_url/en" -UseBasicParsing -TimeoutSec 5 | Out-Null; break } catch {}
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

function PostJson($url, $body, $name) {
  $file = Join-Path $pad "$name.json"
  $body | ConvertTo-Json -Compress -Depth 6 | Set-Content -Path $file -Encoding utf8 -NoNewline
  return curl.exe -s -b $jar -c $jar -X POST -H 'Content-Type: application/json' -H "X-XSRF-TOKEN: $(Token)" -d "@$file" $url
}

# 1) Sin sesion, 401.
$code = curl.exe -s -o NUL -w '%{http_code}' "$api_url/api/landlord/dashboard"
Check 'Sin sesion el portal da 401' ($code -eq '401') "GET /api/landlord/dashboard -> $code"

# 2) Alta de un landlord.
curl.exe -s -c $jar -o NUL "$api_url/api/auth/csrf"
$email = "landlord9-$([guid]::NewGuid().ToString('N').Substring(0,8))@example.com"
$signup = PostJson "$api_url/api/auth/signup" @{
  fullName = 'Fase Nueve Landlord'; email = $email; password = 'Password123'
  confirmPassword = 'Password123'; role = 'Landlord'; culture = 'en'
} 'signup'
Check 'Alta de landlord' ($signup -match '"redirectPath":"/landlord"') $email
curl.exe -s -b $jar -c $jar -o NUL "$api_url/api/auth/csrf"

# 3) Crear un listing con dos unidades en Toronto.
$title = "E2E Fase Nueve Suites $([guid]::NewGuid().ToString('N').Substring(0,6))"
$created = PostJson "$api_url/api/landlord/listings" @{
  title = $title; description = 'Listing de la validacion E2E de la Fase 9.'
  propertyType = 'Apartment'; status = 'Active'
  streetAddress = '900 Validation Ave'; cityName = 'Toronto'; province = 'ON'; postalCode = 'M5V 2T6'
  neighbourhood = $null; petsAllowed = $true; furnished = $false; leaseTerm = 'OneYear'
  parkingType = $null; yearBuilt = $null; totalFloors = $null
  amenityIds = @()
  units = @(
    @{ id = $null; bedrooms = 1; bathrooms = 1; sqFt = 550; price = 2100; availableDate = $null; availableUnits = 1 },
    @{ id = $null; bedrooms = 2; bathrooms = 1.5; sqFt = 800; price = 2900; availableDate = $null; availableUnits = 2 }
  )
} 'listing'
$listingId = ($created | ConvertFrom-Json).id
Check 'El listing se crea' ($created -match 'landlord.listingCreated' -and $listingId) $listingId

# 4) Subir dos fotos por multipart (la primera queda de portada).
$png = Join-Path $pad 'foto.png'
[IO.File]::WriteAllBytes($png, [byte[]](0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A,0x00))
$photos = curl.exe -s -b $jar -c $jar -X POST -H "X-XSRF-TOKEN: $(Token)" `
  -F "files=@$png;type=image/png;filename=una.png" -F "files=@$png;type=image/png;filename=dos.png" `
  "$api_url/api/landlord/listings/$listingId/photos"
$photosJson = $photos | ConvertFrom-Json
Check 'Las fotos se suben y hay portada' (
  $photosJson.images.Count -eq 2 -and $photosJson.images[0].isPrimary -eq $true -and -not $photosJson.warning
) "imagenes=$($photosJson.images.Count) portada=$($photosJson.images[0].isPrimary)"

# 5) La foto subida se sirve desde /uploads en la API.
$imgUrl = $photosJson.images[0].url
$imgCode = curl.exe -s -o NUL -w '%{http_code}' "$api_url$imgUrl"
Check 'El archivo subido se sirve' ($imgCode -eq '200') "$imgUrl -> $imgCode"

# 6) Una consulta anonima aterriza en el inbox.
$anonJar = Join-Path $pad 'anon-cookies.txt'
curl.exe -s -c $anonJar -o NUL "$api_url/api/auth/csrf"
$anonToken = (Select-String -Path $anonJar -Pattern 'XSRF-TOKEN' | Select-Object -Last 1).Line -split "`t" | Select-Object -Last 1
$inqFile = Join-Path $pad 'inquiry.json'
@{
  propertyId = $listingId; senderName = 'Visitante Curioso'; senderEmail = 'visita@example.com'
  senderPhone = $null; message = 'Consulta E2E para el inbox del landlord, fase nueve.'
  moveInDate = $null; culture = 'en'
} | ConvertTo-Json -Compress | Set-Content -Path $inqFile -Encoding utf8 -NoNewline
$inq = curl.exe -s -b $anonJar -X POST -H 'Content-Type: application/json' -H "X-XSRF-TOKEN: $anonToken" -d "@$inqFile" "$api_url/api/inquiries"
Check 'La consulta anonima entra' ($inq -match 'detail.inquirySent') $inq

$inbox = curl.exe -s -b $jar "$api_url/api/landlord/inbox" | ConvertFrom-Json
Check 'El inbox cuenta 1 total y 1 sin leer' ($inbox.totalCount -eq 1 -and $inbox.unreadCount -eq 1) "total=$($inbox.totalCount) unread=$($inbox.unreadCount)"

# 7) Toggle a leida y el filtro de no leidas queda vacio.
$inquiryId = $inbox.inquiries[0].id
$toggle = PostJson "$api_url/api/landlord/inbox/$inquiryId/toggle" @{} 'toggle'
$unread = curl.exe -s -b $jar "$api_url/api/landlord/inbox?filter=unread" | ConvertFrom-Json
Check 'Toggle a leida vacia el filtro' (
  $toggle -match 'landlord.markedRead' -and $unread.unreadCount -eq 0 -and $unread.inquiries.Count -eq 0
) "unread=$($unread.unreadCount) filtradas=$($unread.inquiries.Count)"

# 8) Perfil de marca.
$profileFile = Join-Path $pad 'profile.json'
@{
  fullName = 'Fase Nueve Landlord'; phone = '416-555-0199'
  companyName = 'Validacion Rentals Inc'; website = 'https://validacion.example.com'
  description = 'Gestion E2E de la fase nueve.'
} | ConvertTo-Json -Compress | Set-Content -Path $profileFile -Encoding utf8 -NoNewline
$profileRes = curl.exe -s -b $jar -c $jar -X PUT -H 'Content-Type: application/json' -H "X-XSRF-TOKEN: $(Token)" -d "@$profileFile" "$api_url/api/landlord/profile"
$profileGet = curl.exe -s -b $jar "$api_url/api/landlord/profile" | ConvertFrom-Json
Check 'El perfil de marca se guarda' (
  $profileRes -match 'landlord.accountBrandSaved' -and $profileGet.companyName -eq 'Validacion Rentals Inc'
) $profileGet.companyName

# 9) El HTML SERVIDO de las pantallas del portal, con la cookie.
$html = (curl.exe -s -b $jar "$ssr_url/en/landlord") -join "`n"
Check 'SSR dashboard con nombre' (($html -match 'Welcome back, Fase') -and ($html -match 'Total listings')) '/en/landlord'

$html = (curl.exe -s -b $jar "$ssr_url/en/landlord/listings") -join "`n"
Check 'SSR listings con el listing' (($html -match 'My Listings') -and ($html -match [regex]::Escape($title))) '/en/landlord/listings'

$html = (curl.exe -s -b $jar "$ssr_url/en/landlord/inbox") -join "`n"
Check 'SSR inbox con la consulta' (($html -match 'Visitante Curioso') -and ($html -match 'Consulta E2E')) '/en/landlord/inbox'

$html = (curl.exe -s -b $jar "$ssr_url/en/landlord/account") -join "`n"
Check 'SSR cuenta con el correo' (($html -match 'Account Settings') -and ($html -match [regex]::Escape($email))) '/en/landlord/account'

# 10) La ficha PUBLICA del listing recien creado, sin cookie.
$rows = curl.exe -s -b $jar "$api_url/api/landlord/listings" | ConvertFrom-Json
$slug = ($rows | Where-Object { $_.id -eq $listingId }).slug
$public = (curl.exe -s "$ssr_url/en/toronto/$slug") -join "`n"
Check 'La ficha publica del listing existe' ($public -match [regex]::Escape($title)) "/en/toronto/$slug"

# 11) Sin cookie, el portal rebota al login con un 302 real.
$anon = curl.exe -s -o NUL -w '%{http_code} %{redirect_url}' "$ssr_url/en/landlord"
Check 'Sin cookie el portal rebota a login' ($anon -match '302 .*/en/login\?returnUrl=') $anon

# 12) Un renter no entra: 403 en la API del portal.
$renterJar = Join-Path $pad 'renter-cookies.txt'
curl.exe -s -c $renterJar -o NUL "$api_url/api/auth/csrf"
$rToken = (Select-String -Path $renterJar -Pattern 'XSRF-TOKEN' | Select-Object -Last 1).Line -split "`t" | Select-Object -Last 1
$rFile = Join-Path $pad 'renter-signup.json'
@{
  fullName = 'Renter Intruso'; email = "renter-intruso-$([guid]::NewGuid().ToString('N').Substring(0,6))@example.com"
  password = 'Password123'; confirmPassword = 'Password123'; role = 'Renter'; culture = 'en'
} | ConvertTo-Json -Compress | Set-Content -Path $rFile -Encoding utf8 -NoNewline
curl.exe -s -b $renterJar -c $renterJar -X POST -H 'Content-Type: application/json' -H "X-XSRF-TOKEN: $rToken" -d "@$rFile" "$api_url/api/auth/signup" | Out-Null
$forbidden = curl.exe -s -b $renterJar -o NUL -w '%{http_code}' "$api_url/api/landlord/dashboard"
Check 'Un renter recibe 403' ($forbidden -eq '403') "GET /api/landlord/dashboard -> $forbidden"

$results | Format-Table -AutoSize

$failed = @($results | Where-Object { $_.Estado -eq 'FALLA' }).Count
Write-Output ''
Write-Output "=== $($results.Count - $failed)/$($results.Count) pruebas en verde ==="

$errs = Get-Content "$pad\ssr.err.log" -ErrorAction SilentlyContinue | Select-String -Pattern 'ERROR'
if ($errs) { Write-Output "errores SSR: $($errs.Count)"; $errs | Select-Object -First 3 } else { Write-Output 'errores SSR: ninguno' }

if (-not $ssr.HasExited) { Stop-Process -Id $ssr.Id -Force }
if (-not $api.HasExited) { Stop-Process -Id $api.Id -Force }
Write-Output 'PROCESOS DETENIDOS'
