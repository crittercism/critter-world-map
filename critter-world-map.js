/**
 * Copyright (c) 2013, Crittercism, Inc
 * All rights reserved.
 *
 * Please see included LICENSE.txt
 *
 * Note that this file lives in the critter-world-map github repo. If found
 * elsewhere, it is a copy and you should make sure changes will go back
 * there, which will help us if we want to use this map in blog posts, marketing
 * material or open source it.
 */

function worldmap() {
    var width = 960,
        height = 640,
        svg,map,key,
        zoomDisabled = false,
        zoomDataLoader = null,
        zoomDataPreloader = null,
        keyTitle = '',
        toolTipTitle = '',
        toolTipColor = '#999',
        onZoom = null,
        topojsonPrefix = '',
        dataset=0,
        lastTouchEnd = false,
        firefox=navigator.userAgent.toLowerCase().indexOf('firefox') > -1,
        loaded = false;

    var IE = navigator.userAgent.indexOf(' MSIE ') > -1;

    var DEVMODE = true;

    var projection = d3.geo.miller()
        .scale(width / (2*Math.PI)) // woolly rationale here...
        .translate([width / 2, height * 1.25 / 2])
        .precision(5)
        .rotate([-10,0,0]);

    var colors = d3.scale.category20();
    var format = d3.format("d");

    var quantize = d3.scale.quantize().range(colors.range());

    var MAX_ZOOM = 120;

    var path = d3.geo.path()
        .projection(projection);

    var globalZoom = {};
    var currentZoom = globalZoom;
    var lastCountryZoom = null;
    var lastProvinceZoom = null;

    var deepLink = null;

    function resetSvg() {
        svg.selectAll('.map').remove();
        svg.selectAll('.sea').remove();
        svg.selectAll('.key').remove();
        svg.selectAll('.mapToolTip').remove();
        hideMinusButton();
    }

    function renderSea() {
        var sea = svg.append('rect').classed('sea',true).attr('x',0).attr('y',0).attr('width',width).attr('height',height);
        sea.style("pointer-events", "all").on('click',zoomOut);
    }

    function renderWorld() {
        var w = globalZoom.topojson;
        map = svg.append('g').classed('map',true);

        renderKeyArea();

        var countryGeo = topojson.feature(w, w.objects.countries);

        // trace the outline of the land
        map.insert("path", ".lboundary")
            .datum(topojson.mesh(w, w.objects.land))
            .classed('lboundary',true)
            .classed('land',true)
            .attr("d", path);

        // draw all the countries
        map.selectAll(".country")
            .data(countryGeo.features)
            .enter().append('path')
            .classed('country',true)
            .attr("d", function(t) {
                return path(t);
            }).style('pointer-events','fill');

        // draw boundaries between countries
        map.insert("path", ".cboundary")
            .datum(topojson.mesh(w, w.objects.countries, function(a, b) { return a !== b; }))
            .classed('cboundary',true)
            .attr("d", path).style('pointer-events','none');

        if (!zoomDisabled) {
            map.on("click", zoomRouter).on('touchstart',detectDoubleTap);
        } else {
            map.selectAll(".country").style('cursor','auto');
        }
        map.on("mousemove", mouseOverRegion).on("mouseout", mouseOutRegion);

        IE && fixLineWidths();

        renderLoadingAnimation();
        zoomDataLoader && zoomDataLoader('world',null,null,dataset,'Global',populateGlobalData.bind(this));
        my.deepLink();
    }

    function detectDoubleTap() {
        var t = d3.touches(svg.node()), now;
        now = Date.now();
        DEVMODE && console.log('scanning for double tap...', lastTouchEnd, now, t);
        if (t.length === 1) {
            if (lastTouchEnd && (now - lastTouchEnd <= 750)) {
                DEVMODE && console.log('double tapped...');
                zoomRouter();
            }
            lastTouchEnd = now;
        }
        //d3.event.preventDefault();
    }

    function zoomRouter() {
        var e = d3.event,
            target = d3.select(e.target),
            d = target.datum();

        if (target.classed('country')) {
            zoomToCountryByClick();
        } else if (target.classed('province')) {
            if (d.properties.iso_a2 && d.properties.iso_a2 == 'US') {
                zoomToProvinceByClick();
            } else {
                extraZoom();
            }
        } else if (target.classed('county')) {
            extraZoom();
        }
    }


    function preRenderCountry() {
        map.selectAll(".country").classed('backgrounded',true);
        map.selectAll(".county").remove();
        map.selectAll(".ctboundary").remove();
    }

    function renderCountry() {
        var provincesTopojson = lastCountryZoom.topojson;
        var iso_a2 = lastCountryZoom.id;

        map.selectAll(".cboundary.zoomed").remove();
        map.insert("path", ".cboundary")
            .datum(topojson.mesh(provincesTopojson, provincesTopojson.objects.countries))
            .classed('cboundary',true)
            .classed('zoomed',true)
            .attr("d", path).style('pointer-events', 'none');

        var provinceGeo = topojson.feature(provincesTopojson, provincesTopojson.objects.provinces);
        map.selectAll(".province").remove();
        // draw all the provinces

        var provinces = map.selectAll(".province")
            .data(provinceGeo.features)
            .enter().append('path')
            .classed('province',true)
            .attr("d",function (t) {
                return path(t);
            });

        // draw boundaries between provinces
        map.selectAll(".pboundary").remove();
        map.insert("path", ".pboundary")
            .datum(topojson.mesh(provincesTopojson, provincesTopojson.objects.provinces, function (a, b) {
                return a !== b;
            }))
            .classed('pboundary',true)
            .attr("d", path).style('pointer-events', 'none');

        map.selectAll('#pClip').remove();
        if (iso_a2 == 'TZ') { // add a clipping path by the country outline... to fix tanzania's 'problem'
            provinces.attr("clip-path", "url(#pClip)");
            map.append("defs").append("clipPath")
                .attr("id", "pClip")
                .append("path")
                .datum(topojson.mesh(provincesTopojson, provincesTopojson.objects.countries))
                .attr("d", path).style('pointer-events', 'none');
        }
        provinces.style("pointer-events", "fill");
        IE && fixLineWidths();
    }

    function preRenderCounties() {
        map.selectAll(".cboundary.zoomed").remove();
        map.selectAll(".pboundary.zoomed").remove();
        map.selectAll(".province").classed('mhidden',true);
    }

    function renderCounties() {
        var countiesTopojson = lastProvinceZoom.topojson;

        // draw a refined state outline
        var stateGeo = topojson.feature(countiesTopojson, countiesTopojson.objects.states);
        var state = stateGeo.features[0];
        map.append("path")
            .datum(state)
            .classed('pboundary',true)
            .classed('zoomed',true)
            .attr("d", path).style('pointer-events', 'none');

        // draw the counties.
        var countyGeo = topojson.feature(countiesTopojson, countiesTopojson.objects.counties);
        map.selectAll(".county").remove();
        // draw all the provinces
        map.selectAll(".county")
            .data(countyGeo.features)
            .enter().append('path')
            .classed('county',true)
            .attr("d",function (t) {
                return path(t);
            }).style("pointer-events", "all")
            .attr('style',function(d) {
                // hack to not turn the sea within the county boundary grey...
                // it does exist as a shape in the shapefile, but does not have \
                // a county name.
                if (!d.properties.COUNTY) {
                    return 'fill:none';
                }
                return '';
            });

        // draw boundaries between provinces
        map.selectAll(".ctboundary").remove();
        map.insert("path", ".ctboundary")
            .datum(topojson.mesh(countiesTopojson, countiesTopojson.objects.counties, function (a, b) {
                return a !== b;
            }))
            .classed('ctboundary',true)
            .attr("d", path).style('pointer-events', 'none');
        IE && fixLineWidths();
    }

    function zoomToCountryByClick() {
        var e = d3.event,
            target = d3.select(e.target),
            d = target.datum();

        zoomToCountry(d);
    }

    function zoomToCountryByCode(iso_a2) {
        var w = globalZoom.topojson;
        var countryGeo = topojson.feature(w, w.objects.countries);
        var feature = countryGeo.features.filter(function(c) { return c.properties.iso_a2 == iso_a2; })[0];
        if (feature) {
            zoomToCountry(feature);
        }
    }

    function zoomToCountry(feature) {
        // -99 is a code natural earth gives to tiny territories with no country code... eg/ guantanamo bay
        if (feature && feature.properties && feature.properties.iso_a2 && feature.properties.iso_a2 != -99) {
            iso_a2 = feature.properties.iso_a2;
            name = feature.properties.name;


            lastProvinceZoom = null;
            zoom(feature, ROGUE_STATES, iso_a2, 0.85);
            lastCountryZoom = currentZoom;
            lastCountryZoom.name = name;

            preRenderCountry();

            showMinusButton();

            // disable mouseover events for the selected province, (but not
            // neighbouring countries).
            d3.selectAll('.country').style('pointer-events', function (d) {
                return d.properties.iso_a2 == iso_a2 ? 'none' : 'all';
            });

            // trigger the onzoom handler, but not if we're about to deep link down to a province
            if (!deepLink || deepLink.province == null) {
                onZoom && onZoom('country', zoomedRegionName(), iso_a2);
            }
            zoomDataPreloader && zoomDataPreloader('country', iso_a2, null, dataset, zoomedRegionName());

            d3.json(topojsonPrefix+"/provinces/provinces_"+iso_a2+".json", function(error, ptopo) {
                if (error) {
                    DEVMODE && console.log(error);
                    return;
                }

                if (currentZoom.id == iso_a2) {
                    currentZoom.topojson = ptopo;
                    lastCountryZoom.topojson = ptopo;
                    renderCountry();
                    renderLoadingAnimation();
                    zoomDataLoader && zoomDataLoader('country', iso_a2, null, dataset, zoomedRegionName(), populateProvinceData);
                    my.deepLink();
                }
            });

        } else {
            DEVMODE && console.log('no iso_a2 found', feature, e);
        }
    }

    function zoomToProvinceByClick() {
        var e = d3.event,
            target = d3.select(e.target),
            d = target.datum(), iso_a2, name;

        zoomToProvince(d);
    }

    function zoomToProvinceByCode(adm1_code) {
        var w = lastCountryZoom.topojson;
        var provinceGeo = topojson.feature(w, w.objects.provinces);
        var feature = provinceGeo.features.filter(function(c) { return c.properties.adm1_code == adm1_code; })[0];
        if (feature) {
            zoomToProvince(feature);
        } else {
            DEVMODE && console.log('feature not found');
        }
    }

    /**
     * Currently only works for the us, which zooms a second step into counties...
     *
     * In the future, we may need to do something similar for Australia, Canada and other states.
     */
    function zoomToProvince(feature) {
        var adm1_code, name, currentCountryId = lastCountryZoom.id;
        if (feature && feature.properties && feature.properties.adm1_code) {
            adm1_code = feature.properties.adm1_code;
            name = feature.properties.name;

            zoom(feature, ROGUE_US_PROVINCES_BY_ADM1_CODE, adm1_code, 0.85);
            lastProvinceZoom = currentZoom;
            lastProvinceZoom.name = name;

            preRenderCounties();

            // disable mouseover events for the selected province, (but not
            // neighbouring countries).
            d3.selectAll('.country').style('pointer-events', function (d) {
                return d.properties.iso_a2 == currentCountryId ? 'none' : 'all';
            });
            d3.selectAll('.province').style('pointer-events', function (d) {
                return d.properties.adm1_code == adm1_code ? 'none' : 'all';
            });

            onZoom && onZoom('province', zoomedRegionName(), adm1_code);
            zoomDataPreloader && zoomDataPreloader('province', currentCountryId, adm1_code, dataset, zoomedRegionName());

            d3.json(topojsonPrefix+"/counties/counties_"+adm1_code+".json", function(error, ctopo) {
                if (error) {
                    DEVMODE && console.log(error);
                    return;
                }
                // just in case there's been another click zoom before the load...
                if (currentZoom.id === adm1_code) {
                    currentZoom.topojson = ctopo;
                    lastProvinceZoom.topojson = ctopo;
                    renderCounties();
                    renderLoadingAnimation();
                    zoomDataLoader && zoomDataLoader('province', currentCountryId, adm1_code, dataset, zoomedRegionName(), populateCountyData);
                    my.deepLink();
                }
            });
        }
    }

    function extraZoom() {
        var e = d3.event,
            target = d3.select(e.target),
            d = target.datum(), bounds, fips, adm1_code;

        if (d && d.properties) {
            if (d.properties.FIPS) {
                fips = d.properties.FIPS;
                zoom(d, ROGUE_US_COUNTIES, fips, 0.5);
                if (CALIFORNIA_HACK.indexOf(fips) != -1) {
                    // we're zoomed right in on SF... hack by clipping the
                    // US
                    map.append("defs").append("clipPath")
                        .attr("id", "calHackClip")
                        .append("path")
                        .datum(topojson.mesh(lastProvinceZoom.topojson, lastProvinceZoom.topojson.objects.states))
                        .attr("d", path).style('pointer-events', 'none');

                    setTimeout(function() {
                        map.selectAll('.lboundary').attr("clip-path", "url(#calHackClip)");
                        map.selectAll('.country').attr("clip-path", "url(#calHackClip)");
                    },500);

                } else {
                    killCaliforniaHack();
                }
            } else if (d.properties.adm1_code) {
                adm1_code = d.properties.adm1_code;
                DEVMODE && console.log('Extra zoom on',adm1_code);
                zoom(d, ROGUE_PROVINCES_BY_ADM1_CODE, adm1_code, 0.5);
            }
        }
    }

    function killCaliforniaHack() {
        setTimeout(function() {
            map.selectAll('#calHackClip').remove();
            map.selectAll('.lboundary').attr("clip-path", "");
            map.selectAll('.country').attr("clip-path", "");
        },300);
    }

    function zoomOut() {
        // remove any province clipping shapes.
        map.selectAll('#pClip').remove();
        killCaliforniaHack();

        if (lastProvinceZoom && lastProvinceZoom.id != currentZoom.id) {
            currentZoom = lastProvinceZoom;

            // not much to do here, province zooms don't show/hide anything new
            //renderCounties();
            onZoom && onZoom('province', zoomedRegionName(), lastProvinceZoom.id);
            scaleMap();

        } else if (lastCountryZoom && currentZoom.id != lastCountryZoom.id) {
            currentZoom = lastCountryZoom;
            lastProvinceZoom = null;

            // stop displaying any zoomed in provinces!
            map.selectAll(".county").remove();
            map.selectAll(".ctboundary").remove();
            map.selectAll(".pboundary.zoomed").remove();
            map.selectAll(".cboundary").classed('zoomed',false);

            // re-render the country selection and data
            renderCountry();
            setColorStyles('.province', 'adm1_code', lastCountryZoom.data);

            // re-enable mouseover events and clicks for all provinces
            map.selectAll('.province').style('pointer-events','fill')

            onZoom && onZoom('country', zoomedRegionName(), lastCountryZoom.id);
            scaleMap();

        } else {
            zoomOutWorld();
        }
    }

    function zoomOutWorld() {
        if (currentZoom !== globalZoom) {
            killCaliforniaHack();

            currentZoom = globalZoom;
            lastProvinceZoom = null;
            lastCountryZoom = null;

            // remove any province clipping shapes.
            map.selectAll('#pClip').remove();

            // stop displaying any zoomed in provinces and/or counties!
            map.selectAll(".province").remove();
            map.selectAll(".county").remove();
            map.selectAll(".pboundary").remove();
            map.selectAll(".ctboundary").remove();
            map.selectAll(".cboundary.zoomed").remove();
            map.selectAll(".country").classed('backgrounded',false) // remove background greyed out nature
                .style('pointer-events','fill'); // re-enable mouseover events and clicks

            map.selectAll(".cboundary").classed('zoomed',false);

            // re-render global data
            setColorStyles('.country', 'iso_a2', globalZoom.data);

            hideMinusButton();
            onZoom && onZoom('world', zoomedRegionName(), null);
            scaleMap();
        }
    }

    function zoomedRegionName() {
        if (lastCountryZoom == null) {
            return 'World';
        }
        if (lastProvinceZoom) {
            return lastProvinceZoom.name;
        }
        if (lastCountryZoom) {
            return lastCountryZoom.name;
        }
        return '';
    }

    // note the dataset check - dataset is changed when the map is re-populated
    // and allows you to ignore callbacks from previous datasets
    function populateGlobalData(countryId, provinceId, d, values) {
        DEVMODE && console.log('populateGlobalData', countryId, provinceId, d, values);
        if (d == dataset) {
            globalZoom.data = values;
            if (lastCountryZoom == null) {
                setColorStyles('.country', 'iso_a2', values);
            }
        } else {
            DEVMODE && console.log('data thrown out',d,dataset);
        }
    }

    function populateProvinceData(countryId, provinceId, d, values) {
        DEVMODE && console.log('populateProvinceData', countryId, provinceId, d, values);
        if (lastCountryZoom && lastCountryZoom.id == countryId && d == dataset) {
            lastCountryZoom.data = values;
            if (lastProvinceZoom == null) {
                setColorStyles('.province', 'adm1_code', values);
            }
        } else {
            DEVMODE && console.log('data thrown out',d,dataset);
        }
    }

    function populateCountyData(countryId, provinceId, d, values) {
        DEVMODE && console.log('populateCountyData',countryId, provinceId, d, values);
        if (lastProvinceZoom && lastProvinceZoom.id == provinceId && d == dataset) {
            lastProvinceZoom.data = values;
            setColorStyles('.county', 'FIPS', values);
        } else {
            DEVMODE && console.log('data thrown out',d,dataset);
        }
    }

    function isNumber(obj) {
        return (typeof obj === "number");
    };

    function setColorStyles(cssClass, key, values) {
        DEVMODE && console.log('setColorStyles',cssClass, key, values);
        if (values) {
            var extent = d3.extent(d3.values(values));
            extent[0] = Math.floor(extent[0]);
            extent[1] = Math.ceil(extent[1]);
            // If we don't have a useful range, but want to colour in some countries as zero
            // force the range to 4. Just because it looks good on the key.
            // d3 scale domain fails to work if the extents are equal.
            if (extent[0] == extent[1]) {
                extent[1] += 4;
            }
            quantize.domain(extent);
            svg.selectAll(cssClass)
                .style("fill", function (d) {
                    if (d.properties && values && d.properties[key] && isNumber(values[d.properties[key]])) {
                        var color = quantize(values[d.properties[key]]);
                        //DEVMODE && console.log('setting color to '+color+' for ' + d.properties[key]+' value is '+values[d.properties[key]]);
                        return color;
                    } else {
                        //DEVMODE && console.log('setting color to none for ' + d.properties[key]);
                        // avoid clearing the fill:none on sea areas of US counties
                        if (cssClass == '.county' && !d.properties.COUNTY) {
                            return 'none';
                        }
                        return '';
                    }
                });
            renderKey();
        } else {
            // Blank any coloured in regions... if no values.
            svg.selectAll(cssClass).style('fill',function (d) {
                // avoid clearing the fill:none on sea areas of US counties
                if (cssClass == '.county' && !d.properties.COUNTY) {
                    return 'none';
                }
                return '';
            });
            renderMissingDataKey();
        }
    }

    function mouseOverRegion() {
        var e = d3.event, m = d3.mouse(svg.node()),
            target = d3.select(e.target),
            d = target.datum(), ttxoffset = 10, ttwidth,
            flipped, x, name, data;

        if (!d.properties) {
            return;
        }

        if (d.properties.name) {
            name = d.properties.name;
            if (name == 'France') {
                // The french are special... because of their overseas departments.
                m = d3.mouse(svg.node());
                var departments = ROGUE_STATES['FR'];
                for (i = 0; i < departments.length; i++) {
                    if (isPointInBounds(departments[i].click, m)) {
                        name = departments[i].name;
                        break;
                    }
                }
            }
        } else if (d.properties.COUNTY) {
            name = d.properties.COUNTY;
        } else {
            name = 'Unknown region'; // wha?
        }

        function lookup(zoom, key) {
            if (zoom && zoom.data && zoom.data && zoom.data.hasOwnProperty(key)) {
                return toolTipTitle + ': ' +format(zoom.data[key]);
            } else {
                return toolTipTitle + ': No data';
            }
        }

        if (d.properties.adm1_code) {
            data = lookup(lastCountryZoom, d.properties.adm1_code);
        } else if (d.properties.iso_a2) {
            data = lookup(globalZoom, d.properties.iso_a2);
        } else if (d.properties.FIPS) {
            data = lookup(lastProvinceZoom, d.properties.FIPS);
        }

        ttwidth = (d3.max([name.length, data.length]) * 6) + 10;
        flipped = (m[0] + ttwidth + ttxoffset > width);
        x = flipped ? m[0]-ttwidth-ttxoffset : m[0] + ttxoffset;

        svg.selectAll(".mapToolTip").remove();
        var g = svg.append("g")
            .classed('mapToolTip',true);

        g.append('rect')
            .attr('width',ttwidth)
            .attr('height', '33')
            .attr("x", x)
            .attr("y", m[1]+5);

        g.append("text")
            .attr("x", x + 5)
            .attr("y", m[1] + 15)
            .attr("dy", ".35em")
            .text(name);

        g.append("text")
            .attr("x", x + 5)
            .attr("y", m[1] + 15)
            .attr("dy", "1.6em")
            .style('fill',toolTipColor)
            .text(data);

        //d3.event.stopPropagation();
    }

    function mouseOutRegion() {
        svg.selectAll(".mapToolTip").remove();
    }

    function isPointInBounds(bounds, p) {
        var bottomLeft = projection(bounds[0]), topRight = projection(bounds[1]),
            point, scaling = calculateScaling();
        if (scaling) {
            point = [(p[0]-scaling.tr[0])/scaling.s,(p[1]-scaling.tr[1])/scaling.s];
        } else {
            point = p;
        }
        return point[0] >= bottomLeft[0]
            && point[0] <= topRight[0]
            && point[1] <= bottomLeft[1]
            && point[1] >= topRight[1];
    }

    function scaleMap(transition) {
        var m = (transition || transition == null) ? map.transition().duration(1000) : map, sc = calculateScaling();
        m.attr('transform', 'translate(' + sc.tr.join(',') + ') scale(' + sc.s + ')');
        IE && fixLineWidths();
    }

    function fixLineWidths() {
        var sc = calculateScaling(), s = sc.s;
        var halfPxWidth = (0.5/s) + 'px';
        var twoPxWidth = (2/s) + 'px';
        var selectionWidth = (10/s) + 'px';
        DEVMODE && console.log('fixing line widths for scale '+s+' to ',halfPxWidth,twoPxWidth,selectionWidth);
        map.selectAll(".cboundary").style('stroke-width',halfPxWidth);
        map.selectAll(".ctboundary").style('stroke-width',halfPxWidth);
        map.selectAll(".pboundary").style('stroke-width',halfPxWidth);
        map.selectAll(".cboundary.zoomed").style('stroke-width',selectionWidth);
        map.selectAll(".pboundary.zoomed").style('stroke-width',selectionWidth);
        map.selectAll(".lboundary").style('stroke-width',twoPxWidth);
    }

    function calculateScaling() {
        var bounds, scalePadding;
        if (currentZoom && currentZoom.bounds && currentZoom.scalePadding) {
            bounds = currentZoom.bounds;
            scalePadding = currentZoom.scalePadding;
            var centroid = [d3.mean([bounds[0][0],bounds[1][0]]), d3.mean([bounds[0][1],bounds[1][1]])];
            var p1 = projection(bounds[0]);
            var p2 = projection(bounds[1]);
            var sx = scalePadding/(Math.abs(p2[0] - p1[0]));
            var sy = scalePadding/(Math.abs(p2[1] - p1[1]));

            var s = d3.min([width*sx,height*sy,MAX_ZOOM]);

            var tr = projection(centroid);
            tr[0] = -tr[0]*s + (width)/2;
            tr[1] = -tr[1]*s + (height)/2;
            return {
                s: s,
                tr: tr
            };
        } else {
            return {
                s: 1,
                tr: [0,0]
            }
        }
    }

    function zoom(feature, rogueRegions, id, scalePadding) {
        var m, t, bounds, i;
        if (!feature) {
            DEVMODE && console.log('failing to zoom, cause no feature!');
        }
        if (d3.keys(rogueRegions).indexOf(id) != -1) {
            if (rogueRegions[id].length == 1 || !d3.event) {
                bounds = rogueRegions[id][0].bounds;
            } else {
                m = d3.mouse(svg.node());
                for (i = 0; i < rogueRegions[id].length; i++) {
                    if (isPointInBounds(rogueRegions[id][i].click, m)) {
                        bounds = rogueRegions[id][i].bounds;
                        break;
                    }
                }
            }
        } else {
            bounds = d3.geo.bounds(feature);
        }

        // we have to store all this, as we
        currentZoom = {
            id:id,
            bounds: bounds,
            scalePadding: scalePadding
        };

        scaleMap();
    }


    function showMinusButton() {
        d3.selectAll('.minus').remove();
        var minus = svg.append('g').attr('class','minus');
        minus.append('rect').attr('class','box').attr('x',15).attr('y',45).attr('width',18).attr('height',18);
        minus.append('rect').attr('class','sign').attr('x',20).attr('y',52).attr('width',9).attr('height',4);
        minus.style("pointer-events", "all").on("click", zoomOut);

        var world = svg.append('g').attr('class','minus');
        world.append('rect').attr('class','box').attr('x',15).attr('y',15).attr('width',18).attr('height',18);
        world.append('path').attr('class','world').attr('x',20).attr('y',22).attr('d',WORLD_PATH).attr('transform','translate(31 28) scale(-0.013)');
        world.style("pointer-events", "all").on("click", zoomOutWorld);
    }

    function hideMinusButton() {
        d3.selectAll('.minus').remove();
    }

    function renderKeyArea() {
        var r = quantize.range(),
            l  = r.length, kw = 125, kh = ((l - 1)*20) + 75;
        var key = svg.append('g').attr('class','key').attr('transform','translate('+0+','+(height - (colors.range().length * 20 + 55))+')');
        key.append('rect').attr('x',0).attr('y',0).attr('height',kh).attr('width',kw).attr('style','fill:white; fill-opacity:0.7');
    }

    function renderKey() {
        var d = quantize.domain(),
            r = quantize.range(),
            n, i, label, l  = r.length, kw = 125;
        if (d[1] - d[0] > (r.length*10)) {
            n = Math.round((d[1] - d[0])/r.length);
        } else {
            n = ((d[1] - d[0])/r.length).toFixed(1);
        }
        var key = d3.select('.key');
        key.selectAll('.keyContainer').remove();
        var container = key.append('g').attr('transform','translate(15 0)').attr('class','keyContainer');
        for (i = 0; i < l; i++) {
            container.append('rect').attr('x', 0).attr('y',((l - i - 1)*20 + 40)).attr('height',20).attr('width',20).attr('style','fill:'+ r[i]);
            if ((i + 1) == r.length) {
                label = '>= ' + format(d[0] + n * i);
            } else {
                label = '< ' + format(d[0] + n * (i+1));
            }
            container.append('text').attr('x',kw-30).attr('y',((l - i - 1)*20) + 58).attr('dy','-0.5em').attr('text-anchor','end').text(label);
        }
        container.append('text').attr('class','keyTitle').attr('x',0).attr('y',15).text(keyTitle).attr('dy','1em');
        container.append('line').attr('x1',0).attr('y1',30).attr('x2',kw - 30).attr('y2',30);
    }

    function renderMissingDataKey() {
        var d = quantize.domain(),
            r = quantize.range(),
            l  = r.length, kw = 125;
        var key = d3.select('.key');
        key.selectAll('.keyContainer').remove();
        var container = key.append('g').attr('transform','translate(15 0)').attr('class','keyContainer');
        container.append('text').attr('class','keyTitle').attr('x',0).attr('y',15).text(keyTitle).attr('dy','1em');
        container.append('line').attr('x1',0).attr('y1',30).attr('x2',kw - 30).attr('y2',30);
        container.append('text').attr('class','keyTitle').attr('text-anchor','middle').attr('x',(kw-30)/2).attr('y',55).text('No data').attr('dy','1em');
    }

    function renderLoadingAnimation() {
        var r = quantize.range(), l  = r.length, kw = 125, kh = ((l - 1)*20) + 75, radius = 30, π = Math.PI, θ = π/l;
        var speed = 4,
            start = Date.now();

        var key = d3.select('.key');
        key.selectAll('.keyContainer').remove();
        var container = key.append('g').attr('transform','translate(15 0)').attr('class','keyContainer');
        container.append('text').attr('class','keyTitle').attr('x',0).attr('y',15).text(keyTitle).attr('dy','1em');
        container.append('line').attr('x1',0).attr('y1',30).attr('x2',kw - 30).attr('y2',30);

        var anim = container.append('g').attr('transform', 'translate('+(kw-30)/2+' '+((kh/2)+10)+')').attr('class','anim');
        var circle = anim.selectAll(".loading")
            .data(d3.range(l*2))
            .enter().append("circle")
            .attr("class", "loading");
        circle.attr("style", function (d,i) { return 'fill:'+r[i%l]+';fill-opacity:0' })
            .transition().duration(750).attr("style", function (d,i) { return 'fill:'+r[i%l]+';fill-opacity:1' });
        circle.attr("cy", function(d,i) { return Math.sin(θ*i) * radius });
        circle.attr("cx", function(d,i) { return Math.cos(θ*i) * radius });
        circle.attr("r", 5);

        d3.timer(function() {
            var c = key.selectAll('.anim');
            var angle = (Date.now() - start) * speed,
                transform = function() { return 'translate('+(kw-30)/2+' '+((kh/2)+10)+') rotate(' + angle / radius + ')'; };
            c.attr("transform", transform);
            return c && c[0] && (c[0].length == 0);
        });
    }

    var load = my.load = function() {
        loaded = true;
        onZoom && onZoom('world', 'World', null);
        zoomDataPreloader && zoomDataPreloader('world', null, null, dataset, 'World');
        // For the moment, we have a different view of the world for Firefox users
        // They can't handle the polygons of the real world:
        var json = firefox ? '/world-moz.json' : '/world.json';
        d3.json(topojsonPrefix+json, function(error, world) {
            if (error) {
                DEVMODE && console.log(error);
                return;
            }
            globalZoom.topojson = world;
            renderSea();
            renderWorld();
        });
    };

    /*******************************************************
     * Boring setters, constants and data hashes after this point:    *
     *******************************************************/

    function my(selection){
        svg = selection;
        svg.attr("width", width)
            .attr("height", height);
        load();
    }

    my.width = function(value) {
        if (!arguments.length) return width;
        width = value;
        projection.scale(width / (2*Math.PI)).translate([width / 2, height * 1.25 / 2]);
        return my;
    };

    my.height = function(value) {
        if (!arguments.length) return height;
        height = value;
        projection.scale(width / (2*Math.PI)).translate([width / 2, height * 1.25 / 2]);
        return my;
    };

    my.zoomDataLoader = function(loader) {
        zoomDataLoader = loader;
        return my;
    };

    my.zoomDataPreloader = function(loader) {
        zoomDataPreloader = loader;
        return my;
    };

    my.colors = function(c) {
        colors = c;
        quantize.range(colors.range());
        return my;
    };

    my.format = function(f) {
        format = f;
        return my;
    };

    my.keyTitle = function(t) {
        keyTitle = t;
        return my;
    };

    my.toolTipTitle = function(t) {
        toolTipTitle = t;
        return my;
    };

    my.toolTipColor = function(t) {
        toolTipColor = t;
        return my;
    };

    my.onZoom = function(f) {
        onZoom = f;
        return my;
    };

    my.zoomDisabled = function() {
        zoomDisabled = true;
        return my;
    };

    my.topojsonPrefix = function(s) {
        topojsonPrefix = s;
        return my;
    };

    my.dataset = function(n) {
        if (loaded) {
            dataset = n;
            globalZoom.data = null;
            zoomDataLoader && zoomDataLoader('world', null, null, dataset,'Global',populateGlobalData);
            if (lastCountryZoom) {
                lastCountryZoom.data = null;
                zoomDataLoader && zoomDataLoader('country', lastCountryZoom.id, null, dataset, zoomedRegionName(), populateProvinceData);
            }
            if (lastProvinceZoom) {
                lastProvinceZoom.data = null;
                zoomDataLoader && zoomDataLoader('province', lastCountryZoom.id, lastProvinceZoom.id, dataset, zoomedRegionName(), populateCountyData);
            }
            renderLoadingAnimation();
        }
        return my;
    };

    /**
     *
     * @param country - iso_a2 country code - eg/ US
     * @param province - functional with adm1_code
     * @param county - works for
     */
    my.deepLink = function(country,province,county) {
        DEVMODE && console.log('deeplink',deepLink);
        if (country || province) {
            deepLink = {
                country: country,
                province: province,
                county: county
            };
        }
        if (deepLink) {
            if (deepLink.country && globalZoom.topojson && (!currentZoom || currentZoom.id !== deepLink.country)) {
                zoomToCountryByCode(deepLink.country);
                deepLink.country = null;
            }
            // Zoom to a US state
            if (deepLink.province &&
                currentZoom && currentZoom.id == 'US'
                && lastCountryZoom && lastCountryZoom.topojson
                && (!currentZoom || currentZoom.id !== deepLink.province)) {
                zoomToProvinceByCode(deepLink.province);
                deepLink.province = null;
                DEVMODE && console.log('attempted province zoom');
            }
            // Note, deep linking to extra zoom locations (province or county) is not yet handled.
        }
        return my;
    };

    my.resize = function() {
        resetSvg();
        svg.attr('width',width).attr('height',height);
        renderSea();
        renderWorld();
        if (globalZoom.data) {
            setColorStyles('.country', 'iso_a2', globalZoom.data);
        }
        if (lastCountryZoom) {
            preRenderCountry();
            renderCountry();
            if (lastCountryZoom.data) {
                setColorStyles('.province', 'adm1_code', lastCountryZoom.data);
            }
            if (lastProvinceZoom) {
                preRenderCounties();
                renderCounties();
                if (lastProvinceZoom.data) {
                    setColorStyles('.county', 'FIPS', lastProvinceZoom.data);
                }
            }
            showMinusButton();
        }
        renderKey();
        scaleMap(false);
    }

    my.debug = function(b) {
        DEVMODE = b;
        return my;
    }

    my.getSelectedCountryId = function() {
        if (lastCountryZoom) {
            return lastCountryZoom.id
        }
        else {
            return null; //world
        }
    }

    /**
     * Some irritating states like france don't feel the need to keep their
     * national borders neatly associated with a single polygon close to their
     * main land mass. So drawing a bounding box around French Guiana kinda
     * doesn't work...
     *
     * For these countries, we will translate to a custom viewport transform,
     * based on clicks in different bounding boxes. Eg... a click on French Guiana
     * zooms to south america, a click on France zooms to Europe
     */
    var ROGUE_STATES = {
        'US' : [
            {
                bounds: [[-149,72.435535],
                    [-70,25]]
            }
        ],
        // vive la france! more overseas departments here...
        // just handled the big ones for now:
        // http://en.wikipedia.org/wiki/Overseas_departments_and_territories_of_France
        'FR' : [
            {   // France
                name: 'France',
                click: [[-9,40],
                    [10,51]],
                bounds: [[-7,42],
                    [8,51]]
            },
            {   // French guiana
                name: 'French Guiana',
                click: [[-56,2],[-49,7]],
                bounds: [[-56,2],[-49,7]]
            },
            {   // martinique
                name: 'Martinique',
                click: [[-62,14],[-60,15]],
                bounds: [[-62,14],[-60,15]]
            },
            {   // guadaloupe
                name: 'Guadaloupe',
                click: [[-62,16],[-61,17]],
                bounds: [[-62,16],[-61,17]]
            },
            {
                name: 'Réunion',
                click: [[54,-22],[56,-20]],
                bounds: [[54,-22],[56,-20]]
            },
            {
                name: 'Mayotte',
                click: [[45,-13],[46,-12]],
                bounds: [[45,-13],[46,-12]]
            }
        ],
        'RU' : [
            {
                bounds: [[30,72],
                    [180,43]]
            }
        ],
        'NZ': [
            {
                bounds: [[170,-51],
                    [175,-35]]
            }
        ],
        'GB': [
            {
                bounds: [[-11, 50],
                    [1,59]]
            }
        ],
        'NO': [
            {
                click: [[2, 58],
                    [33,71]],
                bounds: [[2, 58],
                    [33,71]]
            },
            { // svalbard!
                click: [[6, 77],
                    [34,81]],
                bounds: [[6, 77],
                    [34,81]]
            }
        ],
        'NL': [
            {
                bounds: [[3, 50],
                    [8,54]]
            }
        ],
        'ZA': [
            {
                click: [[14, -36],
                    [36,-21]],
                bounds: [[14, -36],
                    [36,-21]]
            },
            {
                click: [[37, -47],
                    [38,-46]],
                bounds: [[37, -47],
                    [38,-46]]
            },
        ]
    };

    // alaska has a few counties containing crazy islands...
    // 02050 the "Bethel Census Area"
    // 02180 "Nome Census Area"
    // 02016 Aleutians West Census Area
    // set a custom bounding box for it.

    var ROGUE_US_COUNTIES = {
        '02050' :[{
            bounds: [[-167,57],[-153,63]]
        }],
        '02180' :[{
            bounds: [[-167,62],[-149,67]]
        }],
        '02016' :[{
            bounds: [[-167,62],[-149,67]]
        }]
    };

    // TODO(prs): There is one more left in alaska, and one more left in russia.
    var ROGUE_PROVINCES_BY_ADM1_CODE = {
        'CAN-635': [{ // northwestern territories, canada
            bounds: [[-125,64],[-100,73]]
        }],
        'CAN-634': [{ // nunavut, canada
            bounds: [[-109,65],[-81,75]]
        }],
        'CAN-687': [{ // nunavut, canada
            bounds: [[-73,46],[-72,53]]
        }],
        'JPN-1860': [{ // tokyo, japan
            bounds: [[139.4,35.5],[139.4,35.5]]
        }],
        'RUS-2321': [{ // chukci autonomous okrug, easternmost region of russia
            bounds: [[158,61],[176,68]]
        }]
    };

    // curses... those pesky aleutian islands!
    var ROGUE_US_PROVINCES_BY_ADM1_CODE = {
        'USA-3563': [{
            bounds: [[-165,52],[-128,71]]
        }]
    };

    /**
     * A bunch of counties zoomed in close on SF... where we want to clip the
     * continental US border by the outline of california and can do so without
     * hiding non zoomed in states.
     */
    var CALIFORNIA_HACK = [
        "06001", "06013",
        "06041", "06075",
        "06081", "06081",
        "06085", "06087",
        "06095", "06097"];

    var WORLD_PATH = "M500 800q136 0 251 -67t182 -182t67 -251t-67 -251t-182 -182t-251 -67t-251 67t-182 182t-67 251t67 251t182 182t251 67zM759.208 623.167q-24.2935 -20.9146 -56.416 -34.875q14.6911 -41.4364 20.583 -64.875q10.9402 -43.5104 17.417 -90.834"+
        "q0.232906 -1.59594 0.46398 -3.40051q0.231074 -1.80457 0.432775 -3.53644q0.201701 -1.73187 0.391256 -3.39864q0.189555 -1.66677 0.412853 -3.5566q0.223298 -1.88982 0.424136 -3.44082q100.348 24.9436 135.416 58.167q-40.1401 86.2595 -119.125 149.75z"+
        "M684.583 671.167q-2.98757 1.5012 -11.4484 6.43q-8.46087 4.9288 -13.4266 6.98602q2.00698 -3.32929 5.2617 -10.5785t4.7383 -10.0045q7.27261 3.12501 14.875 7.16699zM500 716.667q-43.6552 0 -88.542 -74.875q42.7254 -6.75 88.542 -6.75q44.9924 0 88.458 7"+
        "q-44.8916 74.625 -88.458 74.625zM367.417 540.792q-11.2829 -35.9457 -20.459 -87.709q-4.81035 -27.4177 -7.83301 -53.791q75.8462 -11 160.875 -11q85.0288 0 160.875 11q-2.89549 25.2636 -7.83301 53.791q-9.28102 51.906 -20.5 87.709"+
        "q-1.10652 3.61435 -2.48381 7.53701q-1.37729 3.92266 -3.04671 8.46667q-1.66942 4.54401 -2.59448 7.20433q-59.1982 -12.292 -124.417 -12.292q-64.8391 0 -124.375 12.375q-7.72124 -21.7598 -8.20801 -23.291zM340.333 684.583q-5.08923 -2.1066 -13.7215 -7.1274"+
        "q-8.63224 -5.0208 -11.6535 -6.53862q0.667337 -0.361289 15.375 -6.83398q1.4179 2.66727 4.69357 9.89882t5.30643 10.6012zM240.875 623.333q-79.1045 -63.6123 -119.208 -149.916q34.5948 -32.9322 135.416 -58.167q0.290725 2.22889 0.666601 5.52247"+
        "q0.375876 3.29358 0.736459 6.30239q0.360583 3.00881 0.72194 5.46713q6.49591 47.462 17.417 90.833q5.74852 23.119 20.583 64.958q-32.5265 14.3802 -56.333 35zM83.333 300q0 -33.2349 47.4411 -70.2293q47.4411 -36.9944 128.434 -62.3537"+
        "q-9.20801 66.3494 -9.20801 132.583q0 13.1281 0.583008 31.292q-98.8345 22.724 -156.916 59.916q-10.334 -45.5319 -10.334 -91.208zM115.417 140.333q31.7183 -76.125 90.2546 -134.661q58.5364 -58.5364 134.661 -90.2546q-40.0426 66.5478 -63.708 161.208"+
        "q-94.836 23.7094 -161.208 63.708zM500 -116.667q33.2349 0 70.2293 47.4411q36.9944 47.4411 62.3537 128.434q-66.3494 -9.20801 -132.583 -9.20801t-132.583 9.20801q25.3593 -80.9928 62.3537 -128.434q36.9944 -47.4411 70.2293 -47.4411zM500 133.333"+
        "q75.5498 0 153.083 13.584q13.584 77.5332 13.584 153.083q0 5.47876 -0.166992 16.125q-80.6324 -11.167 -166.5 -11.167t-166.5 11.167q-0.166992 -10.6462 -0.166992 -16.125q0 -75.5498 13.584 -153.083q77.5332 -13.584 153.083 -13.584zM659.667 -84.583"+
        "q76.125 31.7183 134.661 90.2546q58.5364 58.5364 90.2546 134.661q-66.5478 -40.0426 -161.208 -63.708q-23.7094 -94.836 -63.708 -161.208zM740.792 167.417q80.9928 25.3593 128.434 62.3537q47.4411 36.9944 47.4411 70.2293q0 45.653 -10.334 91.25"+
        "q-58.2359 -37.2909 -156.916 -59.917q0.583008 -18.2357 0.583008 -31.333q0 -66.2336 -9.20801 -132.583z";

    return my;
}

typeof define !== 'undefined' && define(['d3', 'lib/topojson', 'lib/d3.geo.projection.miller'], function() {
    return worldmap;
});
