param([string]$Editor = 'C:\Program Files\Wonderland\WonderlandEngine\bin\WonderlandEditor.exe')
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path -LiteralPath $Editor)) { throw "Wonderland Editor not found: $Editor" }
& $Editor --windowless --project (Join-Path $taskRoot 'wonderland\VisionLink.wlp') --package --output (Join-Path $taskRoot 'wonderland\deploy')
if ($LASTEXITCODE -ne 0) { throw "Wonderland packaging failed with exit code $LASTEXITCODE" }
$taskDeploy = Join-Path $taskRoot 'wonderland\deploy'
if (-not (Test-Path -LiteralPath (Join-Path $taskDeploy 'VisionLink.bin'))) { throw 'Wonderland scene output is missing.' }
$taskTarget = Join-Path $taskRoot 'public\workspace\wonderland'
New-Item -ItemType Directory -Force -Path $taskTarget | Out-Null
Copy-Item -Path (Join-Path $taskDeploy '*') -Destination $taskTarget -Recurse -Force
$taskVendor = Join-Path $taskTarget 'vendor'
New-Item -ItemType Directory -Force -Path $taskVendor | Out-Null
Copy-Item -Path (Join-Path $taskDeploy 'node_modules\@wonderlandengine\api\*') -Destination $taskVendor -Recurse -Force
Copy-Item -LiteralPath (Join-Path $taskRoot 'wonderland\index.html') -Destination (Join-Path $taskTarget 'index.html') -Force
Write-Output 'Wonderland build copied to public/workspace/wonderland.'
