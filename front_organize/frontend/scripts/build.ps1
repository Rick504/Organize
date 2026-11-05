$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$distPath = Join-Path $projectRoot 'dist'
$assetsPath = Join-Path $distPath 'assets'
New-Item -ItemType Directory -Path $assetsPath -Force | Out-Null
$esbuildPath = Join-Path $projectRoot 'node_modules\@esbuild\win32-x64\esbuild.exe'
if (-not (Test-Path -LiteralPath $esbuildPath)) { throw 'Instale as dependências com npm install antes de compilar.' }
& $esbuildPath 'src/main.tsx' '--bundle' '--outdir=dist/assets' '--entry-names=app' '--format=esm' '--target=es2022' '--jsx=automatic' '--minify' '--loader:.svg=file'
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar frontend.' }
Copy-Item -Path 'public\*' -Destination $distPath -Recurse -Force
$html = Get-Content -LiteralPath 'index.html' -Raw -Encoding UTF8
$assetVersion = [DateTime]::UtcNow.Ticks.ToString()
$html = $html.Replace('/src/main.tsx', "/assets/app.js?v=$assetVersion").Replace('</head>', "<link rel=`"stylesheet`" href=`"/assets/app.css?v=$assetVersion`" /></head>")
Set-Content -LiteralPath (Join-Path $distPath 'index.html') -Value $html -Encoding UTF8
$swPath = Join-Path $distPath 'sw.js'
$sw = Get-Content -LiteralPath $swPath -Raw -Encoding UTF8
if (-not $sw.Contains('__BUILD_ID__')) { throw 'Marcador da versão do Service Worker não encontrado.' }
Set-Content -LiteralPath $swPath -Value $sw.Replace('__BUILD_ID__', $assetVersion) -Encoding UTF8
Write-Host 'Organize compilado em dist/'
