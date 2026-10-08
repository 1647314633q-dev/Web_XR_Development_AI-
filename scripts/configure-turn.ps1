param([ValidateSet('cloudflare','coturn')][string]$Provider='cloudflare')
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
$taskFile=Join-Path $taskRoot '.env.local'
if(Test-Path -LiteralPath $taskFile){throw '.env.local already exists. Edit the existing file to preserve its settings.'}
function Read-Secret([string]$Prompt){$secure=Read-Host $Prompt -AsSecureString;$pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure);try{return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}}
if($Provider -eq 'cloudflare'){$taskKey=Read-Host 'Cloudflare TURN Key ID';$taskSecret=Read-Secret 'Cloudflare TURN API token';$taskSettings=@{CLOUDFLARE_TURN_KEY_ID=$taskKey;CLOUDFLARE_TURN_API_TOKEN=$taskSecret}}
else{$taskUrls=Read-Host 'TURN URLs (comma separated)';$taskSecret=Read-Secret 'Coturn shared secret';$taskSettings=@{TURN_URLS=$taskUrls;TURN_SHARED_SECRET=$taskSecret}}
foreach($value in $taskSettings.Values){if([string]::IsNullOrWhiteSpace($value) -or $value.Contains("`n") -or $value.Contains("`r")){throw 'Settings must be non-empty single-line values.'}}
$taskLines=foreach($item in $taskSettings.GetEnumerator()){$item.Key+'='+($item.Value|ConvertTo-Json -Compress)}
[IO.File]::WriteAllLines($taskFile,$taskLines,[Text.UTF8Encoding]::new($false))
$taskSecret=$null
Write-Output 'Saved ignored .env.local. No secret was printed. Restart the local server to apply.'
