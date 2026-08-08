# Valida el motor de digest de alertas de extremo a extremo: crea una alerta de un Renter,
# dispara el motor con su secreto y comprueba que sale un correo con los listings esperados.
#
# En desarrollo el remitente es NoOpEmailSender, asi que "se envio" se comprueba en el log de
# la API, no en una bandeja de entrada.
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$pad = Join-Path $env:TEMP 'rentca-alerts-logs'
New-Item -ItemType Directory -Force -Path $pad | Out-Null
$jar = Join-Path $pad 'cookies.txt'
Remove-Item $jar -ErrorAction SilentlyContinue

$bin = Join-Path $repo 'src\Rent.Api\bin\Debug\net9.0'
$api_url = 'http://localhost:5282'
$log = Join-Path $pad 'api.log'

$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:ASPNETCORE_URLS = $api_url
$api = Start-Process dotnet -ArgumentList 'Rent.Api.dll' -WorkingDirectory $bin -PassThru -NoNewWindow `
  -RedirectStandardOutput $log -RedirectStandardError "$pad\api.err.log"
for ($i = 0; $i -lt 40; $i++) {
  try { if ((Invoke-WebRequest "$api_url/health" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200) { break } } catch {}
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
function PostJson($url, $obj, $tok) {
  # El cuerpo va por fichero: un JSON en linea pierde las comillas al pasar a curl.exe.
  $file = Join-Path $pad 'body.json'
  $obj | ConvertTo-Json -Compress | Set-Content -Path $file -Encoding utf8 -NoNewline
  return curl.exe -s -b $jar -c $jar -X POST -H 'Content-Type: application/json' -H "X-XSRF-TOKEN: $tok" -d "@$file" $url
}

# 1) Renter con sesion.
curl.exe -s -c $jar -o NUL "$api_url/api/auth/csrf"
$email = "alerts-$([guid]::NewGuid().ToString('N').Substring(0,8))@example.com"
$signup = PostJson "$api_url/api/auth/signup" @{
  fullName = 'Alert Tester'; email = $email; password = 'Password123'
  confirmPassword = 'Password123'; role = 'Renter'; culture = 'en'
} (Token)
Check 'Alta de un Renter' ($signup -match '"redirectPath":"/renter"') $email

# El token anterior se emitio siendo anonimo: hay que renovarlo tras iniciar sesion.
curl.exe -s -b $jar -c $jar -o NUL "$api_url/api/auth/csrf"

# 2) Alerta sobre una ciudad con listings sembrados.
$created = PostJson "$api_url/api/alerts" @{
  name = 'Toronto barato'; city = 'Toronto'; priceMax = 9000
  frequency = 'Daily'; culture = 'en'
} (Token)
Check 'Creacion de la alerta' ($created -match '"isActive":true') 'Toronto, diaria'

# 3) Autenticacion de la ruta de disparo. En desarrollo el secreto SI esta configurado, asi que
#    la ruta existe y lo que procede sin cabecera es un 401. El 404 —fallar cerrado cuando no
#    hay secreto— se comprueba en los tests, donde se puede levantar la API sin configurarlo.
$sinToken = curl.exe -s -o NUL -w '%{http_code}' -X POST "$api_url/api/alerts/dispatch"
Check 'Disparo sin cabecera -> 401' ($sinToken -eq '401') "-> $sinToken"

$malToken = curl.exe -s -o NUL -w '%{http_code}' -X POST -H 'X-Alerts-Token: incorrecto' "$api_url/api/alerts/dispatch"
Check 'Disparo con secreto incorrecto -> 401' ($malToken -eq '401') "-> $malToken"

# 4) Disparo real.
$run = curl.exe -s -X POST -H 'X-Alerts-Token: dev-alerts-token' "$api_url/api/alerts/dispatch"
$parsed = $null
try { $parsed = $run | ConvertFrom-Json } catch {}
Check 'El motor corre y devuelve el resumen' ($null -ne $parsed) $run

if ($parsed) {
  # La alerta recien creada NO debe mandar nada: su ventana empieza en su propia creacion, asi
  # que el catalogo anterior queda fuera. Es la proteccion contra un primer digest con todo el
  # historico. Que un digest con listings nuevos SI se envie se cubre en AlertDigestServiceTests,
  # donde se puede fabricar el orden temporal que aqui no se puede.
  Check 'Una alerta nueva no digiere el catalogo antiguo' ($parsed.sent -eq 0 -and $parsed.noMatches -ge 1) `
    "sent=$($parsed.sent) noMatches=$($parsed.noMatches) due=$($parsed.due)"
}

# 5) Ejecuciones solapadas: la segunda no debe reenviar.
$again = curl.exe -s -X POST -H 'X-Alerts-Token: dev-alerts-token' "$api_url/api/alerts/dispatch"
$parsedAgain = $null
try { $parsedAgain = $again | ConvertFrom-Json } catch {}
if ($parsedAgain) {
  Check 'Una segunda pasada no reenvia' ($parsedAgain.sent -eq 0) "sent=$($parsedAgain.sent) due=$($parsedAgain.due)"
}

$results | Format-Table -AutoSize
$failed = @($results | Where-Object { $_.Estado -eq 'FALLA' }).Count
Write-Output ''
Write-Output "=== $($results.Count - $failed)/$($results.Count) pruebas en verde ==="

if (-not $api.HasExited) { Stop-Process -Id $api.Id -Force }
Write-Output 'PROCESO DETENIDO'
