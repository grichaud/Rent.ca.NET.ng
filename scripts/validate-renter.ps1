# Valida el portal del renter (Fase 8) sobre HTTP real: alta, favorito, alerta, consulta,
# perfil y contrasena por la API, y despues el HTML SERVIDO de las cinco pantallas con la
# cookie del visitante. Mismo patron que validate-auth.ps1: curl.exe con tarro de cookies,
# nunca Invoke-WebRequest, que descarta la cabecera Cookie en silencio.
#
# Requiere `dotnet build` y `npx ng build` previos: ejecuta el .dll y el server.mjs ya
# compilados, no los proyectos.
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$pad = Join-Path $env:TEMP 'rentca-renter-logs'
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
  $body | ConvertTo-Json -Compress | Set-Content -Path $file -Encoding utf8 -NoNewline
  return curl.exe -s -b $jar -c $jar -X POST -H 'Content-Type: application/json' -H "X-XSRF-TOKEN: $(Token)" -d "@$file" $url
}

# 1) Sin sesion, la superficie del portal contesta 401, no una redireccion.
$code = curl.exe -s -o NUL -w '%{http_code}' "$api_url/api/renter/dashboard"
Check 'Sin sesion el portal da 401' ($code -eq '401') "GET /api/renter/dashboard -> $code"

# 2) Alta de un renter.
curl.exe -s -c $jar -o NUL "$api_url/api/auth/csrf"
$email = "renter8-$([guid]::NewGuid().ToString('N').Substring(0,8))@example.com"
$signup = PostJson "$api_url/api/auth/signup" @{
  fullName = 'Fase Ocho'; email = $email; password = 'Password123'
  confirmPassword = 'Password123'; role = 'Renter'; culture = 'en'
} 'signup'
Check 'Alta de renter' ($signup -match '"redirectPath":"/renter"') $email
curl.exe -s -b $jar -c $jar -o NUL "$api_url/api/auth/csrf"   # el token va ligado a la identidad

# 3) Un listing real del catalogo para favorito y consulta.
$homeData = curl.exe -s "$api_url/api/home" | ConvertFrom-Json
$listing = $homeData.latestListings[0]
Check 'Hay listings sembrados' ($null -ne $listing) $listing.title

# 4) Favorito, alerta y consulta por la API.
$fav = PostJson "$api_url/api/favorites/$($listing.id)/toggle" @{} 'favorite'
Check 'El favorito se guarda' ($fav -match '"favorited":true') $fav

$alert = PostJson "$api_url/api/alerts" @{
  name = 'Alerta E2E Fase 8'; city = $listing.city; propertyType = $null
  priceMin = $null; priceMax = 3500; bedroomsMin = $null; bathroomsMin = $null
  petsAllowed = $null; frequency = 'Daily'; culture = 'en'
} 'alert'
Check 'La alerta se crea' ($alert -match '"isActive":true') ($alert.Substring(0, [Math]::Min(80, $alert.Length)))

$inq = PostJson "$api_url/api/inquiries" @{
  propertyId = $listing.id; senderName = 'Fase Ocho'; senderEmail = $email
  senderPhone = $null; message = 'Mensaje E2E del portal del renter, fase ocho.'
  moveInDate = $null; culture = 'en'
} 'inquiry'
Check 'La consulta se envia' ($inq -match 'detail.inquirySent') $inq

# 5) El perfil se actualiza y el dashboard cuenta 1/1/1.
@{ fullName = 'Fase Ocho Renovado'; phone = '416-555-0188' } | ConvertTo-Json -Compress |
  Set-Content -Path (Join-Path $pad 'profile.json') -Encoding utf8 -NoNewline
$profileRes = curl.exe -s -b $jar -c $jar -X PUT -H 'Content-Type: application/json' -H "X-XSRF-TOKEN: $(Token)" `
  -d "@$(Join-Path $pad 'profile.json')" "$api_url/api/renter/profile"
Check 'El perfil se guarda' ($profileRes -match 'renter.accountProfileSaved') $profileRes

$dash = curl.exe -s -b $jar "$api_url/api/renter/dashboard" | ConvertFrom-Json
Check 'El dashboard cuenta 1/1/1' (
  $dash.savedProperties -eq 1 -and $dash.activeAlerts -eq 1 -and $dash.inquiriesSent -eq 1 -and $dash.firstName -eq 'Fase'
) "firstName=$($dash.firstName) fav=$($dash.savedProperties) alertas=$($dash.activeAlerts) consultas=$($dash.inquiriesSent)"

# 6) El HTML SERVIDO de las cinco pantallas, con la cookie del visitante.
$html = (curl.exe -s -b $jar "$ssr_url/en/renter") -join "`n"
Check 'SSR dashboard con nombre' (($html -match 'Hi, Fase') -and ($html -match 'Saved Properties')) '/en/renter'

$html = (curl.exe -s -b $jar "$ssr_url/en/renter/favorites") -join "`n"
Check 'SSR favoritos con el listing' (($html -match 'My Favorites') -and ($html -match [regex]::Escape($listing.title))) '/en/renter/favorites'

$html = (curl.exe -s -b $jar "$ssr_url/en/renter/alerts") -join "`n"
Check 'SSR alertas con la alerta' (($html -match 'My Alerts') -and ($html -match 'Alerta E2E Fase 8')) '/en/renter/alerts'

$html = (curl.exe -s -b $jar "$ssr_url/en/renter/inquiries") -join "`n"
Check 'SSR consultas con el mensaje' (($html -match 'My Inquiries') -and ($html -match 'Mensaje E2E del portal')) '/en/renter/inquiries'

$html = (curl.exe -s -b $jar "$ssr_url/en/renter/account") -join "`n"
Check 'SSR cuenta con el correo' (($html -match 'Account Settings') -and ($html -match [regex]::Escape($email))) '/en/renter/account'

# 7) Sin cookie, el guard rebota el portal al login con un 302 real del servidor SSR.
$anon = curl.exe -s -o NUL -w '%{http_code} %{redirect_url}' "$ssr_url/en/renter"
Check 'Sin cookie el portal rebota a login' ($anon -match '302 .*/en/login\?returnUrl=') $anon

# 8) El cambio de contrasena mantiene la sesion.
$pwdRes = PostJson "$api_url/api/renter/password" @{
  currentPassword = 'Password123'; newPassword = 'NuevaClave123'; confirmPassword = 'NuevaClave123'
} 'password'
Check 'La contrasena se cambia' ($pwdRes -match 'renter.accountPasswordChanged') $pwdRes

$after = curl.exe -s -b $jar -c $jar "$api_url/api/renter/dashboard"
Check 'La sesion sobrevive al cambio' ($after -match '"savedProperties":1') '/api/renter/dashboard tras el cambio'

$results | Format-Table -AutoSize

$failed = @($results | Where-Object { $_.Estado -eq 'FALLA' }).Count
Write-Output ''
Write-Output "=== $($results.Count - $failed)/$($results.Count) pruebas en verde ==="

$errs = Get-Content "$pad\ssr.err.log" -ErrorAction SilentlyContinue | Select-String -Pattern 'ERROR'
if ($errs) { Write-Output "errores SSR: $($errs.Count)"; $errs | Select-Object -First 3 } else { Write-Output 'errores SSR: ninguno' }

if (-not $ssr.HasExited) { Stop-Process -Id $ssr.Id -Force }
if (-not $api.HasExited) { Stop-Process -Id $api.Id -Force }
Write-Output 'PROCESOS DETENIDOS'
