// patched to include d3 miller projection
var π = Math.PI;

var projection = d3.geo.projection;

function miller(λ, φ) {
    return [
        λ,
        1.25 * Math.log(Math.tan(π / 4 + .4 * φ))
    ];
}

miller.invert = function(x, y) {
    return [
        x,
        2.5 * Math.atan(Math.exp(.8 * y)) - .625 * π
    ];
};

if (typeof define !== 'undefined'){
    define(['d3'], function(d3) {
        (d3.geo.miller = function() { return projection(miller); }).raw = miller;
        return d3.geo.miller;
    })
} else {
    (d3.geo.miller = function() { return projection(miller); }).raw = miller;
}
