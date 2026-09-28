// Each browser gets its own private id, so friends' pins stay separate.
let UID = null;
try { UID = localStorage.getItem("uid"); } catch {}
if (!UID) {
  UID = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, "0")).join("");
  try { localStorage.setItem("uid", UID); } catch {}
}
const _fetch = window.fetch;
window.fetch = (u, o = {}) => _fetch(u, { ...o, headers: { ...(o.headers || {}), "X-Uid": UID } });
document.querySelector('a[href="/export.gpx"]').href = "/export.gpx?uid=" + UID;

const $ = id => document.getElementById(id);
let me = null, pins = [], selected = null, heading = 0;
const CAT = { home: "🏠", food: "🍽️", emergency: "🚑", work: "💼", other: "📍" };
let filter = "all";
let recording = false, backMode = false, back = null, arrivedFor = null;

const fmt = m => m < 1000 ? Math.round(m) + " m" : (m / 1000).toFixed(m < 10000 ? 2 : 1) + " km";
const esc = s => { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; };
const post = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function refresh() {
  if (!me) return;
  pins = await (await fetch(`/api/pins?lat=${me.lat}&lng=${me.lng}`)).json();
  if (!selected && pins.length) selected = pins[0].id;   // default: nearest
  if (backMode) {
    const r = await fetch(`/api/wayback?lat=${me.lat}&lng=${me.lng}`);
    back = r.ok ? await r.json() : null;
    if (!back) { backMode = false; $("backBtn").classList.remove("on"); $("status").textContent = "No trail yet. Press Start trail and walk first."; }
  }
  render();
}

function target() {
  if (backMode && back) return { id: "back", name: `Way back (${back.left} steps left)`, ...back };
  return pins.find(p => p.id === selected);
}

function render() {
  const list = $("list");
  list.innerHTML = "";
  if (!pins.length) list.innerHTML = '<li class="empty">No pins yet. Name this spot and pin it.</li>';
  pins.filter(p => filter === "all" || p.category === filter).forEach(p => {
    const li = document.createElement("li");
    li.tabIndex = 0;
    if (p.id === selected && !backMode) li.className = "on";
    li.innerHTML = `<div>${CAT[p.category] || "📍"} ${esc(p.name)}<small>${fmt(p.distance)} · about ${p.eta_min} min walk</small></div>`;
    const del = document.createElement("button");
    del.className = "del"; del.textContent = "×"; del.title = "Remove " + p.name;
    del.onclick = async e => {
      e.stopPropagation();
      await fetch("/api/pins/" + p.id, { method: "DELETE" });
      if (selected === p.id) selected = null;
      refresh();
    };
    li.append(del);
    const pick = () => { selected = p.id; backMode = false; $("backBtn").classList.remove("on"); render(); };
    li.onclick = pick;
    li.onkeydown = e => { if (e.key === "Enter") pick(); };
    list.append(li);
  });
  const t = target();
  $("target").textContent = t ? t.name : "No place selected";
  const here = t && t.distance < 20;
  $("dist").textContent = !t ? "--" : here ? "You're here" : `${fmt(t.distance)} · ${t.eta_min} min`;
  $("dist").classList.toggle("here", !!here);
  if (here && arrivedFor !== t.id + (t.left ?? "")) {   // arrival alert, once per target
    arrivedFor = t.id + (t.left ?? "");
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }
  updateNeedle();
}

function updateNeedle() {
  const t = target();
  if (!t) return;
  $("needle").style.transform = `rotate(${180 + t.bearing - heading}deg)`;
}

// --- location ---
if (!navigator.geolocation) {
  $("status").textContent = "This browser has no location support.";
} else {
  navigator.geolocation.watchPosition(pos => {
    me = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    $("status").textContent = `You: ${me.lat.toFixed(5)}, ${me.lng.toFixed(5)} (±${Math.round(pos.coords.accuracy)} m)` + (recording ? " · recording trail" : "");
    if (recording) post("/api/trail", me);
    refresh();
  }, () => {
    $("status").textContent = "Location blocked. Allow location access in your browser and reload.";
  }, { enableHighAccuracy: true, maximumAge: 2000 });
}

// --- category filter chips ---
function buildChips() {
  const box = $("chips");
  box.innerHTML = "";
  [["all", "All"], ["home", "🏠 Home"], ["food", "🍽️ Food"], ["emergency", "🚑 Emergency"], ["work", "💼 Work"]].forEach(([k, label]) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.className = filter === k ? "on" : "";
    b.onclick = () => {
      filter = k; backMode = false;
      const first = pins.find(p => k === "all" || p.category === k);   // nearest in that category
      if (first) selected = first.id;
      buildChips(); render();
    };
    box.append(b);
  });
}
buildChips();

// --- SOS: one tap shares your live location ---
$("sosBtn").onclick = async () => {
  if (!me) { $("status").textContent = "Still finding your location. Try SOS again in a moment."; return; }
  const link = `https://www.google.com/maps?q=${me.lat},${me.lng}`;
  const text = `I need help. My location: ${link}`;
  if (navigator.vibrate) navigator.vibrate(300);
  try {
    if (navigator.share) await navigator.share({ text });
    else { await navigator.clipboard.writeText(text); $("status").textContent = "SOS message copied. Paste it in WhatsApp or SMS."; }
  } catch { if (!navigator.share) prompt("Copy this SOS message:", text); }
};

// --- dark mode ---
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  $("themeBtn").textContent = t === "dark" ? "Light mode" : "Dark mode";
  try { localStorage.setItem("theme", t); } catch {}
}
let saved = null;
try { saved = localStorage.getItem("theme"); } catch {}
setTheme(saved || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
$("themeBtn").onclick = () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");

// --- pin form ---
$("form").onsubmit = async e => {
  e.preventDefault();
  $("error").textContent = "";
  if (!me) { $("error").textContent = "Still finding your location. Try again in a moment."; return; }
  const r = await post("/api/pins", { name: $("name").value, category: $("cat").value, lat: me.lat, lng: me.lng });
  const d = await r.json();
  if (!r.ok) { $("error").textContent = d.error; return; }
  $("name").value = ""; selected = d.id; backMode = false; refresh();
};

// --- trail + way back ---
$("trailBtn").onclick = async () => {
  recording = !recording;
  $("trailBtn").textContent = recording ? "Stop trail" : "Start trail";
  $("trailBtn").classList.toggle("on", recording);
  if (recording) await fetch("/api/trail", { method: "DELETE" });   // fresh trail each time
};
$("backBtn").onclick = () => {
  backMode = !backMode;
  $("backBtn").classList.toggle("on", backMode);
  if (backMode) recording = false, $("trailBtn").textContent = "Start trail", $("trailBtn").classList.remove("on");
  refresh();
};

// --- share link: opens the app pointing at this spot ---
$("shareBtn").onclick = async () => {
  const t = pins.find(p => p.id === selected);
  if (!t) { $("error").textContent = "Select a pin to share first."; return; }
  const url = `${location.origin}/?lat=${t.lat}&lng=${t.lng}&name=${encodeURIComponent(t.name)}`;
  try { await navigator.clipboard.writeText(url); $("status").textContent = "Share link copied."; }
  catch { prompt("Copy this link:", url); }
};
(async () => {   // opened from a share link? save it and point to it
  const q = new URLSearchParams(location.search);
  if (q.has("lat") && q.has("lng")) {
    const r = await post("/api/pins", { name: q.get("name") || "Shared spot", lat: q.get("lat"), lng: q.get("lng") });
    if (r.ok) selected = (await r.json()).id;
    history.replaceState(null, "", "/");
    refresh();
  }
})();

// --- phone compass (optional) ---
function onOrient(e) {
  if (e.webkitCompassHeading != null) heading = e.webkitCompassHeading;      // iOS
  else if (e.absolute && e.alpha != null) heading = 360 - e.alpha;           // Android
  else return;
  updateNeedle();
}
if ("DeviceOrientationEvent" in window) {
  const btn = $("compassBtn");
  btn.hidden = false;
  btn.onclick = async () => {
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      if (await DeviceOrientationEvent.requestPermission() !== "granted") return;
    }
    window.addEventListener("deviceorientationabsolute", onOrient);
    window.addEventListener("deviceorientation", onOrient);
    btn.hidden = true;
  };
}
