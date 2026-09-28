# Mileage Tracker

A small web app that tells you how many miles you drove from location A to location B, and keeps a log of your trips.

## Features

- Type in a start and an end: an address, a place name, or `lat, lon`
- 📍 button fills in your current location as the start
- Shows the **driving distance** and time along real roads, plus the straight-line distance
- Draws the route on a map
- Round-trip option (doubles the distance)
- Miles or kilometers
- Trip log with date and note, running totals, and reimbursement at a rate per mile you choose (default $0.70/mi)
- Export the log to CSV
- Trips are saved in your browser (localStorage). There's no account and no server.

## Run it

It's a static site with no build step. Serve the folder:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Or turn on GitHub Pages for this repo (Settings → Pages → deploy from branch).

> The 📍 location button only works over `https://` or on `localhost`.

## Services used (free, no API key)

- Map tiles: OpenStreetMap
- Geocoding: [Nominatim](https://nominatim.org/)
- Driving routes: [OSRM](https://project-osrm.org/) public demo server
- Map library: [Leaflet](https://leafletjs.com/)

The public Nominatim and OSRM servers have usage limits and are meant for light personal use.
