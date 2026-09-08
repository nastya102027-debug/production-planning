$projectRoot = Split-Path -Parent $PSScriptRoot
$node = Join-Path $projectRoot ".tools\node-v24.20.0-win-x64\node.exe"
if (-not (Test-Path -LiteralPath $node)) { throw "Локальный Node.js не найден в папке проекта" }
& $node (Join-Path $PSScriptRoot "setup-local.mjs")
exit $LASTEXITCODE
