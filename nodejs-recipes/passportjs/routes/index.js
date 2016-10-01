var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  console.log(JSON.stringify(req.session, null, 2));
  console.log('==================================');
  console.log(JSON.stringify(req.user, null, 2));
  res.render('index', { title: 'Express' });
});

module.exports = router;
