all: world.json provinces counties

node_modules:
	npm install
	cd node_modules/us-atlas && make

# US only...
counties: node_modules
	mkdir -p shp/counties
	mkdir -p topojson/counties
	# cp -r node_modules/us-atlas/shp/* shp/counties
	# generate topojson for each us state
	for STATE in `ls shp/counties/`; do \
		echo $${STATE}; \
		ADM1_CODE=$$(node extractUSPostalAndAdm1Code.js | egrep -i ^$${STATE} | cut -d ' ' -f 2); \
		echo $${ADM1_CODE}; \
		if `[ "$${STATE}" = "ak" ]`; then SIMPLIFY=0.03; else SIMPLIFY=0.2; fi; \
		topojson --cartesian -q 1e6 --simplify-proportion $${SIMPLIFY} -p COUNTY,STATE,FIPS --id-property=+FIPS -- counties=shp/counties/$${STATE}/counties.shp states=shp/counties/$${STATE}/states.shp > topojson/counties/counties_$${ADM1_CODE}.json; \
	done
	cp -r topojson/counties ../topojson

provinces: node_modules
	mkdir -p geojson/provinces
	mkdir -p topojson/provinces
	for ISO_CODE in `node ./countries.js`; do \
		echo $${ISO_CODE}; \
		ogr2ogr -f 'GeoJSON' -where "iso_a2 = ('$${ISO_CODE}')" geojson/provinces/ne_10m_provinces_$${ISO_CODE}_geojson.json ne_10m_admin_1_states_provinces_lakes_shp/ne_10m_admin_1_states_provinces_lakes_shp.shp; \
		ogr2ogr -f 'GeoJSON' -where "iso_a2 = ('$${ISO_CODE}')" geojson/countries/ne_10m_countries_$${ISO_CODE}_geojson.json ne_10m_admin_0_countries_lakes/ne_10m_admin_0_countries_lakes.shp; \
		if `[ "$${ISO_CODE}" = "US" ] || [ "$${ISO_CODE}" = "RU" ] || [ "$${ISO_CODE}" = "CA" ] || [ "$${ISO_CODE}" = "GL" ]`; then SIMPLIFY=0.05; else SIMPLIFY=0.3; fi; \
		topojson --cartesian -q 1e6 --simplify-proportion $${SIMPLIFY} -p name,iso_a2,adm1_code,postal --id-property=+adm1_code -- provinces=geojson/provinces/ne_10m_provinces_$${ISO_CODE}_geojson.json countries=geojson/countries/ne_10m_countries_$${ISO_CODE}_geojson.json > topojson/provinces/provinces_$${ISO_CODE}.json; \
	done
	cp -r topojson/provinces ../topojson

world.json: node_modules
	mkdir -p geojson/countries
	mkdir -p topojson/countries
	ogr2ogr -f 'GeoJSON' -where "admin != ('Antarctica')" geojson/countries/ne_10m_countries_geojson.json ne_10m_admin_0_countries_lakes/ne_10m_admin_0_countries_lakes.shp
	ogr2ogr -f 'GeoJSON' -clipsrc ne_10m_land_clip/ne_10m_land_clip.shp geojson/ne_10m_land_geojson.json ne_10m_land/ne_10m_land.shp
	topojson --cartesian -q 1e5 --simplify-proportion 0.10 -p name,iso_a2,postal --id-property=+iso_a2 -- countries=geojson/countries/ne_10m_countries_geojson.json land=geojson/ne_10m_land_geojson.json | ./topomerge land > topojson/world.json
    # The world needs to be less detailed if you view it in Firefox, which has crappier performance for now. See bug https://bugzilla.mozilla.org/show_bug.cgi?id=754644.
	topojson --cartesian -q 1e5 --simplify-proportion 0.04 -p name,iso_a2,postal --id-property=+iso_a2 -- countries=geojson/countries/ne_10m_countries_geojson.json land=geojson/ne_10m_land_geojson.json | ./topomerge land > topojson/world-moz.json
	cp topojson/world.json ../topojson
	cp topojson/world-moz.json ../topojson
	du -sh topojson/world.json
	du -sh topojson/world-moz.json

clean:
	rm -rf topojson geojson shp
