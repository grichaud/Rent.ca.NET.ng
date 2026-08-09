# Valida el panel de administracion (Fase 10) sobre HTTP real: sesion del admin sembrado,
# dashboard, tier de propietario y de propiedad, promociones (alta, edicion y desactivacion),
# busquedas populares, metricas de IA, y el HTML SERVIDO de las siete pantallas con la cookie.
# Mismo patron que validate-landlord.ps1: curl.exe con tarro de cookies, nunca
# Invoke-WebRequest (descarta la cabecera Cookie en silencio).
#
# Requiere `dotnet build` y `npx ng build` previos. El admin de desarrollo lo siembra
# AdminUserSeeder: admin@rent.local / Admin123!
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$pad = Join-Path $env:TEMP 'rentca-admin-logs'
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

function SendJson($method, $url, $body, $name) {
  $file = Join-Path $pad "$name.json"
  $body | ConvertTo-Json -Compress -Depth 6 | Set-Content -Path $file -Encoding utf8 -NoNewline
  return curl.exe -s -b $jar -c $jar -X $method -H 'Content-Type: application/json' -H "X-XSRF-TOKEN: $(Token)" -d "@$file" $url
}

# 1) Sin sesion, 401 (y no una redireccion al login).
$code = curl.exe -s -o NUL -w '%{http_code}' "$api_url/api/admin/dashboard"
Check 'Sin sesion el panel da 401' ($code -eq '401') "GET /api/admin/dashboard -> $code"

# 2) Sesion del admin sembrado en desarrollo.
curl.exe -s -c $jar -o NUL "$api_url/api/auth/csrf"
$login = SendJson 'POST' "$api_url/api/auth/login" @{
  email = 'admin@rent.local'; password = 'Admin123!'; rememberMe = $false
} 'login'
Check 'Login del admin sembrado' ($login -match '"redirectPath":"/admin"') 'admin@rent.local'
curl.exe -s -b $jar -c $jar -o NUL "$api_url/api/auth/csrf"

# 3) Dashboard con cifras reales del catalogo sembrado.
$dash = curl.exe -s -b $jar "$api_url/api/admin/dashboard" | ConvertFrom-Json
Check 'El dashboard trae contadores' (
  $dash.totalProperties -gt 0 -and $dash.totalLandlords -gt 0
) "propiedades=$($dash.totalProperties) propietarios=$($dash.totalLandlords)"

# 4) Usuarios: el filtro por correo encuentra al propio admin y lo marca como tal.
$users = curl.exe -s -b $jar "$api_url/api/admin/users?email=admin@rent.local" | ConvertFrom-Json
Check 'El filtro de usuarios encuentra al admin' (
  $users.Count -eq 1 -and $users[0].isAdmin -eq $true -and ($users[0].roles -contains 'Admin')
) "roles=$($users[0].roles -join ',')"

# 5) El ultimo administrador no puede quitarse el rol (400, y sigue entrando).
$adminId = $users[0].id
$selfRevoke = curl.exe -s -b $jar -c $jar -o NUL -w '%{http_code}' -X POST `
  -H 'Content-Type: application/json' -H "X-XSRF-TOKEN: $(Token)" -d '{}' `
  "$api_url/api/admin/users/$adminId/toggle-admin"
$stillIn = curl.exe -s -b $jar -o NUL -w '%{http_code}' "$api_url/api/admin/dashboard"
Check 'El ultimo admin no se degrada' ($selfRevoke -eq '400' -and $stillIn -eq '200') "toggle=$selfRevoke dashboard=$stillIn"

# 6) Tier de un propietario, con vigencia futura.
$landlords = curl.exe -s -b $jar "$api_url/api/admin/landlords" | ConvertFrom-Json
$landlord = $landlords.rows[0]
$expires = (Get-Date).ToUniversalTime().AddDays(15).ToString('o')
$setLandlord = SendJson 'POST' "$api_url/api/admin/landlords/$($landlord.id)/tier" @{
  tier = 'Featured'; expiresAt = $expires
} 'landlord-tier'
$after = (curl.exe -s -b $jar "$api_url/api/admin/landlords?email=$($landlord.email)" | ConvertFrom-Json).rows[0]
Check 'El tier del propietario se guarda' (
  $setLandlord -match 'Tier updated' -and $after.tier -eq 'Featured' -and $after.effectiveTier -eq 'Featured'
) "tier=$($after.tier) vence=$($after.tierExpiresAt)"

# 7) Volver a Limited borra la vigencia (Limited no caduca).
SendJson 'POST' "$api_url/api/admin/landlords/$($landlord.id)/tier" @{ tier = 'Limited'; expiresAt = $expires } 'landlord-limited' | Out-Null
$back = (curl.exe -s -b $jar "$api_url/api/admin/landlords?email=$($landlord.email)" | ConvertFrom-Json).rows[0]
Check 'Limited limpia la vigencia' ($back.tier -eq 'Limited' -and $null -eq $back.tierExpiresAt) "vence=$($back.tierExpiresAt)"

# 8) Una vigencia en el pasado se rechaza.
$past = (Get-Date).ToUniversalTime().AddDays(-1).ToString('o')
$badFile = Join-Path $pad 'bad-tier.json'
@{ tier = 'Featured'; expiresAt = $past } | ConvertTo-Json -Compress | Set-Content -Path $badFile -Encoding utf8 -NoNewline
$badCode = curl.exe -s -b $jar -c $jar -o NUL -w '%{http_code}' -X POST `
  -H 'Content-Type: application/json' -H "X-XSRF-TOKEN: $(Token)" -d "@$badFile" `
  "$api_url/api/admin/landlords/$($landlord.id)/tier"
Check 'Una vigencia pasada se rechaza' ($badCode -eq '400') "-> $badCode"

# 9) Tier de una propiedad, y el filtro por ciudad.
$props = curl.exe -s -b $jar "$api_url/api/admin/properties?city=Toronto" | ConvertFrom-Json
$prop = $props.rows[0]
$setProp = SendJson 'POST' "$api_url/api/admin/properties/$($prop.id)/tier" @{
  tier = 'Promoted'; expiresAt = $expires
} 'property-tier'
$propsAfter = curl.exe -s -b $jar "$api_url/api/admin/properties?city=Toronto&tier=Promoted" | ConvertFrom-Json
Check 'El tier de la propiedad se guarda y filtra' (
  $setProp -match 'Tier updated' -and ($propsAfter.rows | Where-Object { $_.id -eq $prop.id })
) "promovidas en Toronto=$($propsAfter.totalRows)"

# 10) Promocion: alta, edicion y desactivacion (soft-delete).
$specialTitle = "E2E Fase Diez $([guid]::NewGuid().ToString('N').Substring(0,6))"
$created = SendJson 'POST' "$api_url/api/admin/specials" @{
  propertyId = $prop.id; title = $specialTitle; description = 'Promocion de la validacion E2E.'
  startDate = $null; endDate = $null; isActive = $true
} 'special-create'
$specialId = ($created | ConvertFrom-Json).id
Check 'La promocion se crea' ($created -match 'created' -and $specialId) $specialId

$edited = SendJson 'PUT' "$api_url/api/admin/specials/$specialId" @{
  title = "$specialTitle editada"; description = $null
  startDate = $null; endDate = $null; isActive = $false
} 'special-update'
$specials = curl.exe -s -b $jar "$api_url/api/admin/specials" | ConvertFrom-Json
$row = $specials.rows | Where-Object { $_.id -eq $specialId }
# Desmarcar "Activa" desactiva de verdad: en el origen el checkbox desmarcado no viajaba y
# el parser caia a true, asi que esto no funcionaba. En JSON el booleano viaja.
Check 'La promocion se edita y se desactiva' (
  $edited -match 'updated' -and $row.title -eq "$specialTitle editada" -and $row.isActive -eq $false
) "activa=$($row.isActive)"

Check 'El selector de propiedades llega' ($specials.propertyOptions.Count -gt 0) "opciones=$($specials.propertyOptions.Count)"

# 11) Una promocion que termina antes de empezar se rechaza.
$backwardsFile = Join-Path $pad 'special-backwards.json'
@{
  propertyId = $prop.id; title = 'Backwards'; description = $null
  startDate = (Get-Date).ToUniversalTime().AddDays(10).ToString('o')
  endDate = (Get-Date).ToUniversalTime().AddDays(1).ToString('o')
  isActive = $true
} | ConvertTo-Json -Compress | Set-Content -Path $backwardsFile -Encoding utf8 -NoNewline
$backwardsCode = curl.exe -s -b $jar -c $jar -o NUL -w '%{http_code}' -X POST `
  -H 'Content-Type: application/json' -H "X-XSRF-TOKEN: $(Token)" -d "@$backwardsFile" "$api_url/api/admin/specials"
Check 'Una ventana invertida se rechaza' ($backwardsCode -eq '400') "-> $backwardsCode"

# 12) El borrado duro quita la fila de verdad.
$hard = curl.exe -s -b $jar -c $jar -X DELETE -H "X-XSRF-TOKEN: $(Token)" "$api_url/api/admin/specials/$specialId`?hard=true"
$afterHard = curl.exe -s -b $jar "$api_url/api/admin/specials" | ConvertFrom-Json
Check 'El borrado duro elimina la promocion' (
  $hard -match 'permanently deleted' -and -not ($afterHard.rows | Where-Object { $_.id -eq $specialId })
) 'hard=true'

# 13) Busquedas populares. Lo que el tracker registra es la COMBINACION DE FILTROS
# normalizada ("minprice=...&maxprice=..."), no texto libre: un `?q=` suelto se guardaria
# como el centinela "(empty)". Y el alta es fire-and-forget, asi que hay que esperarla.
$combo = 'minprice=1234&maxprice=5678'
curl.exe -s -o NUL "$api_url/api/search/toronto?minPrice=1234&maxPrice=5678"
$searches = @()
for ($i = 0; $i -lt 10; $i++) {
  $searches = @(curl.exe -s -b $jar "$api_url/api/admin/searches?q=$([uri]::EscapeDataString($combo))" | ConvertFrom-Json)
  if ($searches.Count -ge 1) { break }
  Start-Sleep -Milliseconds 500
}
Check 'La busqueda queda registrada' ($searches.Count -ge 1) "entradas=$($searches.Count) combo=$combo"

if ($searches.Count -ge 1) {
  $entry = $searches[0]
  $renamed = "E2E Fase Diez $([guid]::NewGuid().ToString('N').Substring(0,6))"
  SendJson 'PUT' "$api_url/api/admin/searches/$($entry.id)" @{
    normalizedQuery = "  $renamed  "; citySlug = '  TORONTO  '
  } 'search-update' | Out-Null
  $afterEdit = curl.exe -s -b $jar "$api_url/api/admin/searches?q=$([uri]::EscapeDataString($renamed.ToLower()))" | ConvertFrom-Json
  $edited = $afterEdit | Where-Object { $_.id -eq $entry.id }
  Check 'La busqueda editada se re-normaliza' (
    $edited.normalizedQuery -ceq $renamed.ToLower() -and $edited.citySlug -ceq 'toronto'
  ) "query=$($edited.normalizedQuery) ciudad=$($edited.citySlug)"

  $del = curl.exe -s -b $jar -c $jar -X DELETE -H "X-XSRF-TOKEN: $(Token)" "$api_url/api/admin/searches/$($entry.id)"
  Check 'La busqueda se borra' ($del -match 'deleted') $del
}

# 14) Metricas de IA: siempre siete cubos diarios.
$ai = curl.exe -s -b $jar "$api_url/api/admin/ai" | ConvertFrom-Json
Check 'Las metricas de IA traen 7 cubos' ($ai.last7Days.Count -eq 7) "cubos=$($ai.last7Days.Count) conversaciones=$($ai.totalConversations)"

# 15) El HTML SERVIDO de las siete pantallas, con la cookie del admin.
$html = (curl.exe -s -b $jar "$ssr_url/en/admin") -join "`n"
Check 'SSR dashboard del panel' (($html -match 'Admin Dashboard') -and ($html -match 'AI Conversations')) '/en/admin'

$html = (curl.exe -s -b $jar "$ssr_url/en/admin/properties") -join "`n"
Check 'SSR propiedades con la tabla' (($html -match 'Promote or demote') -and ($html -match [regex]::Escape($prop.title))) '/en/admin/properties'

$html = (curl.exe -s -b $jar "$ssr_url/en/admin/landlords") -join "`n"
Check 'SSR propietarios con el correo' (($html -match 'landlord-level tier') -and ($html -match [regex]::Escape($landlord.email))) '/en/admin/landlords'

$html = (curl.exe -s -b $jar "$ssr_url/en/admin/specials") -join "`n"
Check 'SSR promociones' ($html -match 'Rent Specials') '/en/admin/specials'

$html = (curl.exe -s -b $jar "$ssr_url/en/admin/searches") -join "`n"
Check 'SSR busquedas populares' (($html -match 'Popular Searches') -and ($html -match 'top 20')) '/en/admin/searches'

$html = (curl.exe -s -b $jar "$ssr_url/en/admin/ai") -join "`n"
Check 'SSR uso de la IA' (($html -match 'AI Usage') -and ($html -match 'Estimated tokens')) '/en/admin/ai'

# Se BUSCA al admin en vez de esperarlo en la lista cruda: esa pantalla es un top-50 sin
# paginar (decision de la Fase 10, igual que el origen) y la suite E2E de la Fase 13 crea una
# cuenta nueva por prueba, asi que en una base de desarrollo con uso real el admin sembrado
# acaba cayendose de los primeros 50. Filtrar por correo es ademas lo que haria una persona.
$html = (curl.exe -s -b $jar "$ssr_url/en/admin/users?email=admin@rent.local") -join "`n"
Check 'SSR usuarios con el admin' (($html -match 'Users') -and ($html -match 'admin@rent.local')) '/en/admin/users?email='

# 16) Sin cookie, el panel rebota al login con un 302 real (no lo renderiza inline).
$anon = curl.exe -s -o NUL -w '%{http_code} %{redirect_url}' "$ssr_url/en/admin"
Check 'Sin cookie el panel rebota a login' ($anon -match '302 .*/en/login\?returnUrl=') $anon

# 17) Un renter identificado recibe 403: quien manda es el servidor, no el guard del cliente.
$renterJar = Join-Path $pad 'renter-cookies.txt'
Remove-Item $renterJar -ErrorAction SilentlyContinue
curl.exe -s -c $renterJar -o NUL "$api_url/api/auth/csrf"
$rToken = (Select-String -Path $renterJar -Pattern 'XSRF-TOKEN' | Select-Object -Last 1).Line -split "`t" | Select-Object -Last 1
$rFile = Join-Path $pad 'renter-signup.json'
@{
  fullName = 'Renter Intruso'; email = "renter-admin-$([guid]::NewGuid().ToString('N').Substring(0,6))@example.com"
  password = 'Password123'; confirmPassword = 'Password123'; role = 'Renter'; culture = 'en'
} | ConvertTo-Json -Compress | Set-Content -Path $rFile -Encoding utf8 -NoNewline
curl.exe -s -b $renterJar -c $renterJar -X POST -H 'Content-Type: application/json' -H "X-XSRF-TOKEN: $rToken" -d "@$rFile" "$api_url/api/auth/signup" | Out-Null
$forbidden = curl.exe -s -b $renterJar -o NUL -w '%{http_code}' "$api_url/api/admin/dashboard"
Check 'Un renter recibe 403' ($forbidden -eq '403') "GET /api/admin/dashboard -> $forbidden"

$results | Format-Table -AutoSize

$failed = @($results | Where-Object { $_.Estado -eq 'FALLA' }).Count
Write-Output ''
Write-Output "=== $($results.Count - $failed)/$($results.Count) pruebas en verde ==="

$errs = Get-Content "$pad\ssr.err.log" -ErrorAction SilentlyContinue | Select-String -Pattern 'ERROR'
if ($errs) { Write-Output "errores SSR: $($errs.Count)"; $errs | Select-Object -First 3 } else { Write-Output 'errores SSR: ninguno' }

if (-not $ssr.HasExited) { Stop-Process -Id $ssr.Id -Force }
if (-not $api.HasExited) { Stop-Process -Id $api.Id -Force }
Write-Output 'PROCESOS DETENIDOS'
