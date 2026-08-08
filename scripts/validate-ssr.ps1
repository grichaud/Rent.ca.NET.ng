$ErrorActionPreference = 'Continue'
# Rutas relativas al repo: la version anterior apuntaba al scratchpad de una sesion concreta y
# dejaba de escribir logs en cuanto esa carpeta desaparecia.
$repo = Split-Path -Parent $PSScriptRoot
$pad = Join-Path $env:TEMP 'rentca-ssr-logs'
New-Item -ItemType Directory -Force -Path $pad | Out-Null
$bin = Join-Path $repo 'src\Rent.Api\bin\Debug\net9.0'
$cli = Join-Path $repo 'src\rent-client'

$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:ASPNETCORE_URLS = 'http://localhost:5282'
$api = Start-Process dotnet -ArgumentList 'Rent.Api.dll' -WorkingDirectory $bin -PassThru -NoNewWindow -RedirectStandardOutput "$pad\fin-api.log" -RedirectStandardError "$pad\fin-api.err.log"
for ($i = 0; $i -lt 40; $i++) {
  try { if ((Invoke-WebRequest 'http://localhost:5282/health' -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200) { break } } catch {}
  Start-Sleep -Seconds 2
}

$env:PORT = '4000'
$env:API_BASE_URL = 'http://localhost:5282'
$ssr = Start-Process node -ArgumentList 'dist\rent-client\server\server.mjs' -WorkingDirectory $cli -PassThru -NoNewWindow -RedirectStandardOutput "$pad\fin-ssr.log" -RedirectStandardError "$pad\fin-ssr.err.log"
for ($i = 0; $i -lt 30; $i++) {
  try { Invoke-WebRequest 'http://localhost:4000/en' -UseBasicParsing -TimeoutSec 5 | Out-Null; break } catch {}
  Start-Sleep -Seconds 2
}

$routes = @(
  @('/en',                                      'Popular Cities'),
  @('/en/toronto',                              'Rentals in'),
  @('/en/toronto?view=list',                    'Rentals in'),
  @('/en/toronto/luxury-loft-liberty-village',  'Available units'),
  @('/en/about',                                'Our Mission'),
  @('/en/faq',                                  'Faq_Title|Frequently'),
  @('/en/privacy',                              'Privacy'),
  @('/fr',                                      'Villes|Trouvez'),
  @('/fr/toronto',                              'Louer|logement'),
  @('/fr/about',                                'propos|Con'),
  @('/fr/faq',                                  'quentes|questions|FAQ'),
  @('/en/login',                                'Welcome back'),
  @('/en/signup',                               'Create your account'),
  @('/en/forgot-password',                      'Reset your password'),
  @('/fr/login',                                'Bon retour')
)

Write-Output 'ruta                                          bytes   estado'
Write-Output '--------------------------------------------- ------- ------'
foreach ($r in $routes) {
  $html = (curl.exe -s ("http://localhost:4000" + $r[0])) -join "`n"
  $okContent = [bool]($html -match $r[1])
  $noPlaceholder = -not [bool]($html -match 'fase posterior del PRP')
  $status = if ($okContent -and $noPlaceholder) { 'OK' } elseif (-not $noPlaceholder) { 'PLACEHOLDER' } else { 'FALTA' }
  Write-Output ("{0,-45} {1,7} {2}" -f $r[0], $html.Length, $status)
}

Write-Output ''
Write-Output '=== errores SSR ==='
$errs = Get-Content "$pad\fin-ssr.err.log" -ErrorAction SilentlyContinue | Select-String -Pattern 'ERROR'
if ($errs) { Write-Output ("  " + $errs.Count + " errores"); $errs | Select-Object -First 3 } else { Write-Output '  ninguno' }

if (-not $ssr.HasExited) { Stop-Process -Id $ssr.Id -Force }
if (-not $api.HasExited) { Stop-Process -Id $api.Id -Force }
Write-Output 'PROCESOS DETENIDOS'
