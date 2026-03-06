# Map data

## countries.geojson (optional)

For the escalation risk choropleth layer, the map loads country boundaries from a GeoJSON with an ISO 3166-1 alpha-2 property (e.g. `ISO_A2`).

If you add `countries.geojson` here, the app will use it (same-origin). Otherwise it fetches Natural Earth 110m from:

https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson

To use a local file: download that GeoJSON and save it as `countries.geojson` in this folder.
