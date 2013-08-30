var us = require('./topojson/provinces/provinces_US.json');
var topojson = require('topojson');
var _ = require('underscore');

var provinces = topojson.feature(us, us.objects.provinces);

_(provinces.features).each(function(c) {
    console.log(c.properties.postal, c.properties.adm1_code);
});
