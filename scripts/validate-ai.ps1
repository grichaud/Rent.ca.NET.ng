# Valida el asistente de IA (Fase 11) sobre HTTP real: antiforgery, el flujo SSE, la
# persistencia del hilo, el aislamiento entre visitantes, la cuota por hora y —cerrando el
# circulo con la Fase 10— que la conversacion aparezca en el panel de administracion.
#
# Corre SIN clave de OpenRouter: el sustituto NoOp responde un aviso, que es justo lo que
# permite validar la feature entera sin gastar cuota de API.
#
# Requiere `dotnet build` y `npx ng build` previos.
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$pad = Join-Path $env:TEMP 'rentca-ai-logs'
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

function TokenFrom($cookieJar) {
  $line = Select-String -Path $cookieJar -Pattern 'XSRF-TOKEN' | Select-Object -Last 1
  if (-not $line) { return '' }
  return ($line.Line -split "`t")[-1]
}

function ChatBody($message, $conversationId, $locale) {
  return @{
    conversationId = $conversationId
    message        = $message
    locale         = $locale
    context        = @{ currentPage = "/$locale/toronto"; currentCity = 'Toronto'; currentPropertyId = $null }
  }
}

# Envia un mensaje y devuelve el cuerpo SSE crudo.
function SendChat($cookieJar, $body, $name) {
  $file = Join-Path $pad "$name.json"
  $body | ConvertTo-Json -Compress -Depth 6 | Set-Content -Path $file -Encoding utf8 -NoNewline
  return (curl.exe -s -b $cookieJar -c $cookieJar -X POST -H 'Content-Type: application/json' `
      -H "X-XSRF-TOKEN: $(TokenFrom $cookieJar)" -d "@$file" "$api_url/api/ai/chat") -join "`n"
}

# El texto llega troceado en eventos de 24 caracteres: hay que reensamblarlo, igual que el
# cliente. Buscar una frase entera en el cuerpo crudo no la encuentra nunca.
function StreamedText($sse) {
  $text = ''
  foreach ($line in ($sse -split "`n")) {
    if ($line -match '^data:\s*(\{.*\})$') {
      $payload = $Matches[1] | ConvertFrom-Json
      if ($null -ne $payload.content) { $text += $payload.content }
    }
  }
  return $text
}

# 1) Sin token de antiforgery, 400.
$noToken = Join-Path $pad 'no-token.json'
(ChatBody 'hola' $null 'en') | ConvertTo-Json -Compress -Depth 6 | Set-Content -Path $noToken -Encoding utf8 -NoNewline
$code = curl.exe -s -o NUL -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d "@$noToken" "$api_url/api/ai/chat"
Check 'Sin antiforgery el chat da 400' ($code -eq '400') "POST /api/ai/chat -> $code"

# 2) Un visitante anonimo conversa y recibe el flujo SSE.
curl.exe -s -c $jar -o NUL "$api_url/api/auth/csrf"
$sse = SendChat $jar (ChatBody 'Busco un loft en Toronto' $null 'en') 'chat1'
$text = StreamedText $sse
Check 'El chat responde por SSE' (
  $sse -match 'event: message' -and $sse -match 'event: done' -and $text.Length -gt 0
) "texto=$($text.Substring(0, [Math]::Min(40, $text.Length)))..."

# 3) Sin clave de API contesta el sustituto (y NO revienta).
Check 'Sin clave responde el sustituto' ($text -match 'not configured') 'NoOpOpenRouterClient'

# 4) El hilo se persiste y se recupera con la cookie de sesion.
$active = curl.exe -s -b $jar "$api_url/api/ai/conversation" | ConvertFrom-Json
$roles = @($active.conversation.messages | ForEach-Object { $_.role })
Check 'El hilo se guarda y se recupera' (
  $active.conversation -and $active.conversation.title -eq 'Busco un loft en Toronto' -and
  $roles.Count -eq 2 -and $roles[0] -eq 'user' -and $roles[1] -eq 'assistant'
) "titulo=$($active.conversation.title) mensajes=$($roles.Count)"

# 5) Un segundo mensaje continua el MISMO hilo.
$conversationId = $active.conversation.id
SendChat $jar (ChatBody 'Y con dos habitaciones?' $conversationId 'en') 'chat2' | Out-Null
$active2 = curl.exe -s -b $jar "$api_url/api/ai/conversation" | ConvertFrom-Json
Check 'El segundo mensaje continua el hilo' (
  $active2.conversation.id -eq $conversationId -and $active2.conversation.messages.Count -eq 4
) "mensajes=$($active2.conversation.messages.Count)"

# 6) Un mensaje vacio se rechaza.
$emptyFile = Join-Path $pad 'empty.json'
(ChatBody '   ' $null 'en') | ConvertTo-Json -Compress -Depth 6 | Set-Content -Path $emptyFile -Encoding utf8 -NoNewline
$emptyCode = curl.exe -s -b $jar -c $jar -o NUL -w '%{http_code}' -X POST -H 'Content-Type: application/json' `
  -H "X-XSRF-TOKEN: $(TokenFrom $jar)" -d "@$emptyFile" "$api_url/api/ai/chat"
Check 'Un mensaje vacio se rechaza' ($emptyCode -eq '400') "-> $emptyCode"

# 7) El hilo de otro visitante no se puede continuar.
$otherJar = Join-Path $pad 'other-cookies.txt'
Remove-Item $otherJar -ErrorAction SilentlyContinue
curl.exe -s -c $otherJar -o NUL "$api_url/api/auth/csrf"
SendChat $otherJar (ChatBody 'Soy otro visitante' $conversationId 'en') 'chat-intruso' | Out-Null
$otherActive = curl.exe -s -b $otherJar "$api_url/api/ai/conversation" | ConvertFrom-Json
Check 'El hilo ajeno no se continua' (
  $otherActive.conversation.id -ne $conversationId -and
  -not ($otherActive.conversation.messages | Where-Object { $_.content -eq 'Busco un loft en Toronto' })
) "hilo propio=$($otherActive.conversation.id)"

# 8) La conversacion aparece en el panel de administracion (cierra el circulo con la Fase 10).
$adminJar = Join-Path $pad 'admin-cookies.txt'
Remove-Item $adminJar -ErrorAction SilentlyContinue
curl.exe -s -c $adminJar -o NUL "$api_url/api/auth/csrf"
$loginFile = Join-Path $pad 'admin-login.json'
@{ email = 'admin@rent.local'; password = 'Admin123!'; rememberMe = $false } |
  ConvertTo-Json -Compress | Set-Content -Path $loginFile -Encoding utf8 -NoNewline
curl.exe -s -b $adminJar -c $adminJar -X POST -H 'Content-Type: application/json' `
  -H "X-XSRF-TOKEN: $(TokenFrom $adminJar)" -d "@$loginFile" "$api_url/api/auth/login" | Out-Null
$metrics = curl.exe -s -b $adminJar "$api_url/api/admin/ai" | ConvertFrom-Json
Check 'El panel de admin ve las conversaciones' (
  $metrics.totalConversations -ge 2 -and $metrics.totalMessages -ge 4 -and $metrics.estimatedTokens -gt 0
) "conversaciones=$($metrics.totalConversations) mensajes=$($metrics.totalMessages) tokens=$($metrics.estimatedTokens)"

$detail = curl.exe -s -b $adminJar "$api_url/api/admin/ai/$conversationId" | ConvertFrom-Json
Check 'El detalle de la conversacion se lee' (
  $detail.id -eq $conversationId -and $detail.messages.Count -ge 4
) "mensajes=$($detail.messages.Count)"

# 9) La cuota por hora corta al superar el limite (20 por defecto).
$quotaJar = Join-Path $pad 'quota-cookies.txt'
Remove-Item $quotaJar -ErrorAction SilentlyContinue
curl.exe -s -c $quotaJar -o NUL "$api_url/api/auth/csrf"
$quotaFile = Join-Path $pad 'quota.json'
(ChatBody 'ping' $null 'en') | ConvertTo-Json -Compress -Depth 6 | Set-Content -Path $quotaFile -Encoding utf8 -NoNewline
$lastCode = ''
for ($i = 1; $i -le 21; $i++) {
  $lastCode = curl.exe -s -b $quotaJar -c $quotaJar -o NUL -w '%{http_code}' -X POST `
    -H 'Content-Type: application/json' -H "X-XSRF-TOKEN: $(TokenFrom $quotaJar)" `
    -d "@$quotaFile" "$api_url/api/ai/chat"
  if ($lastCode -eq '429') { break }
}
Check 'La cuota por hora corta' ($lastCode -eq '429') "peticion $i -> $lastCode"

# 10) El widget NO se renderiza en el servidor (es interaccion pura) pero la pagina sigue bien.
$html = (curl.exe -s "$ssr_url/en") -join "`n"
Check 'El SSR sigue sano y sin widget' (
  $html -match 'Rent.ca' -and $html -notmatch 'ai-chat-panel'
) 'el chat se monta solo en el navegador'

# 11) Las pantallas de auth no llevan asistente, como en el origen.
$loginHtml = (curl.exe -s "$ssr_url/en/login") -join "`n"
Check 'Login sin asistente' ($loginHtml -notmatch 'ai-chat-panel') '/en/login'

$results | Format-Table -AutoSize

$failed = @($results | Where-Object { $_.Estado -eq 'FALLA' }).Count
Write-Output ''
Write-Output "=== $($results.Count - $failed)/$($results.Count) pruebas en verde ==="

$errs = Get-Content "$pad\ssr.err.log" -ErrorAction SilentlyContinue | Select-String -Pattern 'ERROR'
if ($errs) { Write-Output "errores SSR: $($errs.Count)"; $errs | Select-Object -First 3 } else { Write-Output 'errores SSR: ninguno' }

if (-not $ssr.HasExited) { Stop-Process -Id $ssr.Id -Force }
if (-not $api.HasExited) { Stop-Process -Id $api.Id -Force }
Write-Output 'PROCESOS DETENIDOS'
