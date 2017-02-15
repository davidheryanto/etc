# JetBrains: Cannot read property 'status' of undefined" on express's default template
# Tools -> File Watchers -> Jade -> (Pencil Icon)
Arguments: $FileName$ --client

# Pass variable from jade to script
script.
  var mydata = !{JSON.stringify(data)}
# On the server side, assuming data is an object fetched using bookshelfjs
res.render('page', {data: data.toJSON()});