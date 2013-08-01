var world = require('./topojson/world.json');
var topojson = require('topojson');
var _ = require('underscore');

var countries = topojson.feature(world, world.objects.countries);

_(countries.features).each(function(c) {
    var iso_a2 = c.properties.iso_a2;
    if (iso_a2 != -99) {
        console.log(c.properties.iso_a2);
    }
});
