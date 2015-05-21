# Testresponse time and generate csv report
# How to run:
# > .\measure_response_time.ps1 <url> <repeat_count>

param($URL, $Times, $OutPath)
$i = 0
While ($i -lt $Times)
{$Request = New-Object System.Net.WebClient
$Request.UseDefaultCredentials = $true
$Start = Get-Date
$PageRequest = $Request.DownloadString($URL)
$TimeTaken = ((Get-Date) - $Start).TotalMilliseconds 
$Request.Dispose()
Write-Host Request $i took $TimeTaken ms -ForegroundColor Green
# To write the result to .csv file
# Write-Output "$URL, $i, $TimeTaken" | Out-File $OutPath -Append
$i ++}