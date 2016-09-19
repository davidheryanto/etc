# Export multiple md and use cached css
## Powershell
Get-ChildItem . -Filter *.md | ForEach-Object { grip --export $_.Name --no-inline  }
### Look at ~/.grip/ and rename the cache to asset. Then, move asset to current directory. Then,
Get-ChildItem . -Filter *.html | ForEach-Object { (Get-Content $_.Name).replace("/__/grip/", "") | Set-Content $_.Name  }