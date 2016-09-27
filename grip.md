# Export multiple md and use cached css
## Powershell
Get-ChildItem -Recurse -Filter *.md . | ForEach-Object { grip --export $_.FullName --no-inline  }
### Look at ~/.grip/ and rename the cache to asset. Then, move asset to current directory. Then,
Get-ChildItem -Recurse -Filter *.html . | ForEach-Object { (Get-Content $_.Name).replace("/__/grip/", "") | Set-Content $_.Name  }