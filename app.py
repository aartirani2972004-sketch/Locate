import json, math, os, uuid
from flask import Flask, Response, jsonify, render_template, request, send_from_directory

app = Flask(__name__)
CATEGORIES = ["home", "food", "emergency", "work", "other"]
DATA = os.path.join(os.path.dirname(__file__), "data")


def uid():
    """Each browser gets a random id, so friends never see each other's pins."""
    u = request.headers.get("X-Uid") or request.args.get("uid") or ""
    return u if u.isalnum() and 8 <= len(u) <= 40 else "guest"


def path(kind):
    os.makedirs(DATA, exist_ok=True)
    return os.path.join(DATA, f"{kind}_{uid()}.json")


def load():
    if not os.path.exists(path("pins")):
        return []
    with open(path("pins"), encoding="utf-8") as f:
        return json.load(f)


def save(pins):
    with open(path("pins"), "w", encoding="utf-8") as f:
        json.dump(pins, f, indent=2, ensure_ascii=False)


def distance_and_bearing(lat1, lon1, lat2, lon2):
    """Haversine distance (metres) and initial bearing (0-360, north = 0)."""
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    dist = 2 * r * math.asin(math.sqrt(a))
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return dist, (math.degrees(math.atan2(y, x)) + 360) % 360


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/pins", methods=["GET"])
def list_pins():
    lat = request.args.get("lat", type=float)
    lng = request.args.get("lng", type=float)
    pins = load()
    if lat is not None and lng is not None:
        for p in pins:
            p["distance"], p["bearing"] = distance_and_bearing(lat, lng, p["lat"], p["lng"])
            p["eta_min"] = max(1, round(p["distance"] / 83))  # walking ~5 km/h
        pins.sort(key=lambda p: p["distance"])
    return jsonify(pins)


@app.route("/api/pins", methods=["POST"])
def add_pin():
    d = request.get_json(force=True)
    name = (d.get("name") or "").strip()[:40]
    if not name:
        return jsonify(error="Give this place a name."), 400
    try:
        lat, lng = float(d["lat"]), float(d["lng"])
    except (KeyError, ValueError, TypeError):
        return jsonify(error="Latitude and longitude must be numbers."), 400
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return jsonify(error="Coordinates are out of range."), 400
    pins = load()
    cat = d.get("category") if d.get("category") in CATEGORIES else "other"
    pin = {"id": uuid.uuid4().hex[:8], "name": name, "lat": lat, "lng": lng, "category": cat}
    pins.append(pin)
    save(pins)
    return jsonify(pin), 201


@app.route("/api/pins/<pin_id>", methods=["DELETE"])
def delete_pin(pin_id):
    save([p for p in load() if p["id"] != pin_id])
    return "", 204




def load_trail():
    if not os.path.exists(path("trail")):
        return []
    with open(path("trail"), encoding="utf-8") as f:
        return json.load(f)


@app.route("/api/trail", methods=["POST"])
def add_crumb():
    """Record a breadcrumb, but only if you moved more than 10 m."""
    d = request.get_json(force=True)
    crumbs = load_trail()
    lat, lng = float(d["lat"]), float(d["lng"])
    if crumbs and distance_and_bearing(crumbs[-1][0], crumbs[-1][1], lat, lng)[0] < 10:
        return jsonify(count=len(crumbs))
    crumbs.append([lat, lng])
    with open(path("trail"), "w") as f:
        json.dump(crumbs, f)
    return jsonify(count=len(crumbs))


@app.route("/api/trail", methods=["DELETE"])
def clear_trail():
    if os.path.exists(path("trail")):
        os.remove(path("trail"))
    return "", 204


@app.route("/api/wayback")
def wayback():
    """Next breadcrumb to walk to, so you can retrace your steps."""
    lat, lng = request.args.get("lat", type=float), request.args.get("lng", type=float)
    crumbs = load_trail()
    if not crumbs or lat is None or lng is None:
        return jsonify(error="No trail recorded yet."), 404
    dists = [distance_and_bearing(lat, lng, c[0], c[1])[0] for c in crumbs]
    k = dists.index(min(dists))
    if dists[k] < 15 and k > 0:
        k -= 1
    dist, bearing = distance_and_bearing(lat, lng, *crumbs[k])
    return jsonify(distance=dist, bearing=bearing, left=k, eta_min=max(1, round(dist / 83)))


@app.route("/export.gpx")
def export_gpx():
    pts = "".join(f'<wpt lat="{p["lat"]}" lon="{p["lng"]}"><name>{p["name"]}</name></wpt>' for p in load())
    xml = f'<?xml version="1.0"?><gpx version="1.1" creator="Locate" xmlns="http://www.topografix.com/GPX/1/1">{pts}</gpx>'
    return Response(xml, mimetype="application/gpx+xml",
                    headers={"Content-Disposition": "attachment; filename=locate-pins.gpx"})


@app.route("/sw.js")
def service_worker():
    # served from the root so the worker can control the whole app
    resp = send_from_directory(app.static_folder, "sw.js")
    resp.headers["Service-Worker-Allowed"] = "/"
    return resp


if __name__ == "__main__":
    app.run(debug=True, port=5000)
