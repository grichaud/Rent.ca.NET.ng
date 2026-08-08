# Valida el flujo de autenticacion de extremo a extremo sobre HTTP real: alta, sesion, la
# renderizacion en SSR con la cookie del visitante, y el cierre de sesion.
#
# Se usa curl.exe con un tarro de cookies y NUNCA Invoke-WebRequest: este ultimo descarta en
# silencio la cabecera Cookie que se le pase a mano, con lo que toda prueba de sesion daria un
# falso negativo imposible de diagnosticar.
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$pad = Join-Path $env:TEMP 'rentca-auth-logs'
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

# 1) La superficie protegida responde con codigos, no con redirecciones a una pagina de login.
$code = curl.exe -s -o NUL -w '%{http_code}' -X POST "$api_url/api/auth/logout"
Check '401/400 y no 302 en /api' ($code -eq '400') "POST sin token antiforgery -> $code"

# 2) Token de antiforgery.
curl.exe -s -c $jar -o NUL "$api_url/api/auth/csrf"
$token = Token
Check 'Emite cookie XSRF-TOKEN' ($token.Length -gt 20) "longitud $($token.Length)"

# 3) Alta. El cuerpo va por fichero (`-d "@ruta"`) y no en linea: al pasar un JSON inline a
#    curl.exe desde PowerShell se pierden las comillas por el camino y la API recibe basura.
$email = "e2e-$([guid]::NewGuid().ToString('N').Substring(0,8))@example.com"
$bodyFile = Join-Path $pad 'signup.json'
@{ fullName = 'E2E Tester'; email = $email; password = 'Password123'; confirmPassword = 'Password123'; role = 'Renter'; culture = 'en' } |
  ConvertTo-Json -Compress | Set-Content -Path $bodyFile -Encoding utf8 -NoNewline
$signup = curl.exe -s -b $jar -c $jar -X POST -H 'Content-Type: application/json' -H "X-XSRF-TOKEN: $token" -d "@$bodyFile" "$api_url/api/auth/signup"
$signupOk = $signup -match '"redirectPath":"/renter"'
Check 'Alta devuelve el portal del rol' $signupOk $email

# 4) La cookie sostiene la sesion en la API.
$me = curl.exe -s -b $jar "$api_url/api/auth/me"
Check 'La API reconoce la sesion' ($me -match [regex]::Escape($email)) '/api/auth/me'

# 5) El SSR renderiza YA autenticado. Es la prueba del riesgo alto: el servidor de render tiene
#    que prestar la cookie del visitante a su llamada a la API.
$html = (curl.exe -s -b $jar "$ssr_url/en") -join "`n"
$ssrAuth = ($html -match 'E2E Tester') -and ($html -match 'log-out|Sign Out|Log out')
Check 'El HTML del SSR sale con sesion' $ssrAuth 'header con nombre y boton de salir'

# 6) Sin cookie, el mismo HTML sale anonimo.
$anon = (curl.exe -s "$ssr_url/en") -join "`n"
Check 'Sin cookie el SSR sale anonimo' (($anon -notmatch 'E2E Tester') -and ($anon -match 'Sign In')) 'header con Sign In'

# 7) Cierre de sesion (el token hay que renovarlo: va ligado a la identidad).
curl.exe -s -b $jar -c $jar -o NUL "$api_url/api/auth/csrf"
$token = Token
$logout = curl.exe -s -o NUL -w '%{http_code}' -b $jar -c $jar -X POST -H "X-XSRF-TOKEN: $token" "$api_url/api/auth/logout"
Check 'Cierre de sesion' ($logout -eq '204') "-> $logout"

$after = curl.exe -s -b $jar "$api_url/api/auth/me"
Check 'Tras salir no hay usuario' ($after -match '"user":null') $after

$results | Format-Table -AutoSize

$failed = @($results | Where-Object { $_.Estado -eq 'FALLA' }).Count
Write-Output ''
Write-Output "=== $($results.Count - $failed)/$($results.Count) pruebas en verde ==="

$errs = Get-Content "$pad\ssr.err.log" -ErrorAction SilentlyContinue | Select-String -Pattern 'ERROR'
if ($errs) { Write-Output "errores SSR: $($errs.Count)"; $errs | Select-Object -First 3 } else { Write-Output 'errores SSR: ninguno' }

if (-not $ssr.HasExited) { Stop-Process -Id $ssr.Id -Force }
if (-not $api.HasExited) { Stop-Process -Id $api.Id -Force }
Write-Output 'PROCESOS DETENIDOS'
