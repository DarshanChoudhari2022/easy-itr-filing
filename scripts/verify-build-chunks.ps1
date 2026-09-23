$ErrorActionPreference = 'Stop'

$reactChunk = Get-ChildItem dist/assets/index-*.js | Sort-Object Length -Descending | Select-Object -First 1
$radixChunk = Get-ChildItem dist/assets/*.js | Where-Object { $_.Name -notlike 'index-*' -and $_.Name -notlike 'vendor-pdf-*' -and $_.Name -notlike 'vendor-supabase-*' } | Select-Object -First 1

if (-not $reactChunk -or -not $radixChunk) { throw 'Expected application and shared chunks were not generated.' }

$radixSize = $radixChunk.Length
if ($radixSize -lt 1000) { throw "Shared application chunk is unexpectedly small ($radixSize bytes)." }

$reactText = Get-Content $reactChunk.FullName -Raw
if ($reactText -notmatch 'createContext') { throw 'Application bundle does not contain React createContext.' }

Write-Output "Build chunk check passed: App=$($reactChunk.Name), Shared=$($radixChunk.Name), SharedBytes=$radixSize"
