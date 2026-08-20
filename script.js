const results = document.getElementById("results");
const emptyState = document.getElementById("empty-state");
const databaseState = document.getElementById("database-state");
const searchInput = document.getElementById("search-input");
const searchForm = document.getElementById("search-form");
const countryFilter = document.getElementById("country-filter");
const countryGrid = document.getElementById("country-grid");
const statIps = document.getElementById("stat-ips");
const statCountries = document.getElementById("stat-countries");
const statCities = document.getElementById("stat-cities");
const modal = document.getElementById("submit-modal");
const formMessage = document.getElementById("form-message");
const submitForm = document.getElementById("submit-form");
const submitButton = document.getElementById("submit-button");
const geolocateButton = document.getElementById("geolocate-button");
const ipInput = document.getElementById("ip-input");
const geoStep = document.getElementById("geo-step");
const ipStep = document.getElementById("ip-step");
const countryInput = document.getElementById("country-input");
const countryNameInput = document.getElementById("country-name-input");

const API = "/api";
const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const flagFor = (code) => ({CA:"🇨🇦",US:"🇺🇸",GB:"🇬🇧",DE:"🇩🇪",FR:"🇫🇷",NL:"🇳🇱",JP:"🇯🇵",AU:"🇦🇺"}[code] || "🌐");
let countryMaster = [];
let currentPreview = null;

async function getJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

async function loadCountryMaster() {
  try {
    const response = await fetch("/data/locations/countries.json", { cache: "no-store" });
    const data = await response.json();
    countryMaster = Array.isArray(data.countries) ? data.countries : [];
  } catch (_) {
    countryMaster = [
      {code:"CA", name:"Canada"},{code:"US",name:"United States"},{code:"GB",name:"United Kingdom"},
      {code:"DE",name:"Germany"},{code:"FR",name:"France"},{code:"NL",name:"Netherlands"},{code:"JP",name:"Japan"},{code:"AU",name:"Australia"}
    ];
  }
  populateCountryControls();
}

function populateCountryControls(selected = "") {
  const options = countryMaster.slice().sort((a,b) => a.name.localeCompare(b.name));
  countryInput.innerHTML = options.map(c => `<option value="${esc(c.code)}">${esc(flagFor(c.code))} ${esc(c.name)}</option>`).join("");
  if (selected) countryInput.value = selected;

  const current = countryFilter.value;
  const unique = options;
  countryFilter.innerHTML = '<option value="">All countries</option>' + unique.map(c => `<option value="${esc(c.code)}">${esc(c.name)}</option>`).join("");
  countryFilter.value = current;
}

function setField(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value ?? "";
}

function loadFormGeo(geo) {
  setField("country-name-input", geo.country_name);
  countryInput.value = geo.country_code || countryMaster[0]?.code || "";
  setField("region-input", geo.region_name);
  setField("city-input", geo.city_name);
  setField("latitude-input", geo.latitude);
  setField("longitude-input", geo.longitude);
  setField("zip-input", geo.zip_code);
  setField("timezone-input", geo.time_zone);
  setField("asn-input", geo.asn ? `AS${String(geo.asn).replace(/^AS/i, "")}` : "");
  setField("as-name-input", geo.as_name);
  setField("isp-input", geo.isp);
  setField("domain-input", geo.domain);
  setField("usage-input", geo.usage_type);
  document.getElementById("proxy-input").checked = Boolean(geo.is_proxy);
}

function readEditedGeo() {
  return {
    country_code: countryInput.value,
    country_name: document.getElementById("country-name-input").value.trim(),
    region_name: document.getElementById("region-input").value.trim(),
    city_name: document.getElementById("city-input").value.trim(),
    latitude: document.getElementById("latitude-input").value.trim(),
    longitude: document.getElementById("longitude-input").value.trim(),
    zip_code: document.getElementById("zip-input").value.trim(),
    time_zone: document.getElementById("timezone-input").value.trim(),
    asn: document.getElementById("asn-input").value.trim(),
    as_name: document.getElementById("as-name-input").value.trim(),
    isp: document.getElementById("isp-input").value.trim(),
    domain: document.getElementById("domain-input").value.trim(),
    usage_type: document.getElementById("usage-input").value.trim(),
    is_proxy: document.getElementById("proxy-input").checked ? 1 : 0
  };
}

async function loadStats() {
  try {
    const data = await getJson(`${API}/stats`);
    statIps.textContent = Number(data.ips || 0).toLocaleString();
    statCountries.textContent = Number(data.countries || 0).toLocaleString();
    statCities.textContent = Number(data.cities || 0).toLocaleString();
    databaseState.classList.add("hidden");
  } catch (error) {
    statIps.textContent = "—"; statCountries.textContent = "—"; statCities.textContent = "—";
    databaseState.textContent = `Database is not connected yet: ${error.message}`;
    databaseState.classList.remove("hidden");
  }
}

function renderResults(items) {
  results.innerHTML = items.map(e => `
    <article class="ip-card">
      <div class="ip-top"><span class="ip-address">${esc(e.ip)}</span><span class="ip-version">IPv${esc(e.ip_version || (e.ip.includes(":") ? "6" : "4"))}</span></div>
      <div class="ip-meta">
        <div class="meta-item"><span>Location</span><strong>${esc(e.city_name || "Unknown")}${e.region_name ? `, ${esc(e.region_name)}` : ""}</strong></div>
        <div class="meta-item"><span>Network</span><strong>${esc(e.isp || e.as_name || "Unknown")}</strong></div>
        <div class="meta-item"><span>Country</span><strong>${flagFor(e.country_code)} ${esc(e.country_name || e.country_code || "Unknown")}</strong></div>
        <div class="meta-item"><span>ASN</span><strong>${e.asn ? `AS${esc(String(e.asn).replace(/^AS/i,""))}` : "Not provided"}</strong></div>
      </div>
      <div class="card-footer"><span class="country-tag">${esc(e.latitude ?? "—")}, ${esc(e.longitude ?? "—")}</span><button class="copy-ip" data-copy="${esc(e.ip)}">Copy IP</button></div>
    </article>`).join("");
  emptyState.classList.toggle("hidden", items.length !== 0);
  results.classList.toggle("hidden", items.length === 0);
  results.querySelectorAll("[data-copy]").forEach(button => button.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(button.dataset.copy); button.textContent = "Copied!"; setTimeout(() => button.textContent = "Copy IP", 1200); }
    catch (_) { button.textContent = button.dataset.copy; }
  }));
}

function renderCountryGrid(items) {
  const grouped = {};
  items.forEach(e => {
    if (!e.country_code) return;
    if (!grouped[e.country_code]) grouped[e.country_code] = { name: e.country_name || e.country_code, count: 0 };
    grouped[e.country_code].count++;
  });
  countryGrid.innerHTML = Object.entries(grouped).sort((a,b) => b[1].count - a[1].count).map(([code,data]) => `<button class="country-card" data-country="${esc(code)}"><div class="country-name"><span>${flagFor(code)}</span>${esc(data.name)}</div><div class="country-count">${data.count} current ${data.count === 1 ? "entry" : "entries"}</div></button>`).join("");
  countryGrid.querySelectorAll("[data-country]").forEach(button => button.addEventListener("click", () => { countryFilter.value = button.dataset.country; searchInput.value = ""; loadResults(); document.getElementById("directory").scrollIntoView({behavior:"smooth"}); }));
}

async function loadResults() {
  const params = new URLSearchParams({ limit: "100" });
  if (searchInput.value.trim()) params.set("q", searchInput.value.trim());
  if (countryFilter.value) params.set("country", countryFilter.value);
  try {
    const data = await getJson(`${API}/search?${params}`);
    renderResults(data.results || []);
    renderCountryGrid(data.results || []);
    databaseState.classList.add("hidden");
  } catch (error) {
    renderResults([]);
    databaseState.textContent = `Search is unavailable: ${error.message}`;
    databaseState.classList.remove("hidden");
  }
}

function openModal() {
  modal.classList.remove("hidden"); modal.setAttribute("aria-hidden", "false");
  ipStep.classList.remove("hidden"); geoStep.classList.add("hidden"); formMessage.classList.add("hidden"); currentPreview = null;
  geolocateButton.disabled = false; geolocateButton.textContent = "Geolocate IP";
  ipInput.focus(); document.body.style.overflow = "hidden";
}
function closeModal() { modal.classList.add("hidden"); modal.setAttribute("aria-hidden", "true"); document.body.style.overflow = ""; }
function setMessage(text, error = false) { formMessage.textContent = text; formMessage.classList.remove("hidden"); formMessage.style.color = error ? "#ff9e9e" : ""; formMessage.style.background = error ? "rgba(255,110,110,.08)" : ""; }

searchForm.addEventListener("submit", e => { e.preventDefault(); loadResults(); document.getElementById("directory").scrollIntoView({behavior:"smooth"}); });
searchInput.addEventListener("input", () => { clearTimeout(window.__pingmapSearchTimer); window.__pingmapSearchTimer = setTimeout(loadResults, 180); });
countryFilter.addEventListener("change", loadResults);
document.getElementById("clear-search").addEventListener("click", () => { searchInput.value = ""; countryFilter.value = ""; loadResults(); });
document.addEventListener("keydown", e => { if (e.key === "/" && document.activeElement.tagName !== "INPUT") { e.preventDefault(); searchInput.focus(); } if (e.key === "Escape") closeModal(); });
document.getElementById("open-submit-top").addEventListener("click", openModal);
document.getElementById("open-submit-main").addEventListener("click", openModal);
document.getElementById("close-submit").addEventListener("click", closeModal);
modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });

document.getElementById("use-my-ip").addEventListener("click", async () => {
  try { const data = await getJson(`${API}/my-ip`); if (!data.ip) throw new Error("Cloudflare did not provide your public IP."); ipInput.value = data.ip; }
  catch (error) { setMessage(error.message, true); }
});

document.getElementById("back-to-ip").addEventListener("click", () => { geoStep.classList.add("hidden"); ipStep.classList.remove("hidden"); formMessage.classList.add("hidden"); });

gelolocateButton.addEventListener("click", async () => {
  const ip = ipInput.value.trim();
  if (!ip) return setMessage("Enter a public IP address first.", true);
  geolocateButton.disabled = true; geolocateButton.textContent = "Geolocating…"; formMessage.classList.add("hidden");
  try {
    const data = await getJson(`${API}/preview`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ip}) });
    currentPreview = { ip: data.ip, geo: data.geo };
    loadFormGeo(data.geo);
    ipStep.classList.add("hidden"); geoStep.classList.remove("hidden");
    setMessage("Geolocation found. Review or correct the information, then verify the IP to add it.");
    submitButton.disabled = false; submitButton.textContent = "Verify ping + add";
  } catch (error) {
    setMessage(error.message, true); geolocateButton.disabled = false; geolocateButton.textContent = "Geolocate IP";
  }
});

submitForm.addEventListener("submit", async e => {
  e.preventDefault();
  if (!currentPreview) return setMessage("Geolocate the IP first.", true);
  const edited = readEditedGeo();
  if (!edited.country_code || !edited.country_name) return setMessage("Choose a country before submitting.", true);
  submitButton.disabled = true; submitButton.textContent = "Pinging + adding…";
  setMessage("Running the ICMP reachability check. The IP will only be added if it responds.");
  try {
    const data = await getJson(`${API}/submit`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ ip: currentPreview.ip, ...edited }) });
    setMessage(`Added ${data.entry.ip} — ${data.entry.city_name}, ${data.entry.region_name}, ${data.entry.country_name}. Average ping: ${data.ping.avgMs ?? "—"} ms.`);
    submitButton.textContent = "Added!";
    await Promise.all([loadStats(), loadResults()]);
  } catch (error) {
    setMessage(error.message, true); submitButton.disabled = false; submitButton.textContent = "Verify ping + add";
  }
});

(async function init() { await loadCountryMaster(); await loadStats(); await loadResults(); })();
