# Locate
Pin places with your live location, then follow a compass needle back to any of them.

    pip install -r requirements.txt
    python app.py      # open http://127.0.0.1:5000

- Python (Flask): stores pins, computes distance + bearing (haversine).
- HTML/CSS/JS: live GPS, sorted list, compass dial.
- Geolocation needs https or localhost. For a phone, use an https tunnel (e.g. ngrok).

## Features
- Compass needle to any saved pin, with distance and walking time
- Arrival alert (vibrates within 20 m)
- Trail + Way back: record breadcrumbs as you walk, then retrace them
- Share link: opens the app pointing at your spot (works when the app is hosted online)
- Export all pins as GPX (opens in Google Earth, Garmin, etc.)

- Pin categories with emoji + category filter chips
- SOS button (native share sheet, or copies message)
- Installable PWA + offline app shell
- Dark mode (auto + toggle)
