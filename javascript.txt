# Checking type of variable
typeof myvar === 'function'

function isObject(obj) {
  return Object.prototype.toString.call(obj) === '[object Object]'
}

function isArray(obj) {
  return Object.prototype.toString.call(obj) === '[object Array]'
}

function isString(obj) {
  return typeof obj === 'string';
}

# Get properties of an object (direct properties)
# https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/getOwnPropertyNames
Object.getOwnPropertyNames(obj)

# Deep compare object, use underscore.js
_.isEqual(object, other);

# Loops
for (var i = 0; i < arrayLength; i++) {
    alert(myStringArray[i]);
    // Do something
}

# Map
[1,2,3,4].map(function(item) {
     alert(item);
})

# Create query string params with jQuery
$.param({ width:1680, height:1050 });
=> "width=1680&height=1050"

# Collapse whitespace
# http://stackoverflow.com/questions/6163169/replace-multiple-whitespaces-with-single-whitespace-in-javascript-string
s.replace(/\s+/g, ' ');

# =======================
# Function Design Pattern
# =======================

# Function that takes variable no of arguments
# option + callback OR option only OR callback only
function(options, callback) {
	if (typeof options === 'function') {
		callback = options;
		options = {};
	}
}
