# Match multiple values
# https://webapps.stackexchange.com/questions/107284/how-do-i-make-the-text-contains-evaluate-multiple-values-in-google-spreadsheet
=match(A1,{"blue","green","orange","red","white"},0) 
=regexmatch(A1,"blue|green|orange|red|white")
