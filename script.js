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
const submitButton = document.getElementById("submit-button");
const ipInput = document.getElementById("ip-input");

const API = "/api";
const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const flagFor = (code) => ({CA:"🇨🇦",US:"🇺🇸",GB:"🇬🇧",DE:"🇩🇪",FR:"🇫🇷",NL:"🇳🇱",JP:"🇯🇵",AU:"🇦🇺"}[code] || "🌐");

async function getJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

async function loadStats() {
  try {
    const data = await getJson(`${API}/stats`);
    statIps.textContent = Number(data.ips || 0).toLocaleString();
    statCountries.textContent = Number(data.countries || 0).toLocaleString();
    statCities.textContent = Number(data.cities || 0).toLocaleString();
    databaseState.classList.add("hidden");
    return true;
  } catch (error) {
    statIps.textContent = "—";
    statCountries.textContent = "—";
    statCities.textContent = "—";
    databaseState.textContent = `Database is not connected yet: ${error.message}`;
    databaseState.classList.remove("hidden");
    return false;
  }
}

async function loadCountries() {
  try {
    const data = await getJson(`${API}/countries`);
    const countries = (data.results || []).filter(e => e.country_code).map(e => [e.country_code, e.country_name, e.entries]);
    const current = countryFilter.value;
    countryFilter.innerHTML = '<option value="">All countries</option>' + countries.map(([code,name]) => `<option value="${esc(code)}">${esc(name)}</option>`).join("");
    countryFilter.value = current;
    countryGrid.innerHTML = countries.map(([code,name,count]) => `
      <button class="country-card" data-country="${esc(code)}">
        <div class="country-name"><span>${flagFor(code)}</span>${esc(name)}</div>
        <div class="country-count">${Number(count).toLocaleString()} ${Number(count) === 1 ? "entry" : "entries"}</div>
      </button>`).join("");
    countryGrid.querySelectorAll("[data-country]").forEach(button => {
      button.addEventListener("click", () => {
        countryFilter.value = button.dataset.country;
        searchInput.value = "";
        loadResults();
        document.getElementById("directory").scrollIntoView({ behavior: "smooth" });
      });
    });
  } catch (_) {
    countryFilter.innerHTML = '<option value="">All countries</option>';
    countryGrid.innerHTML = "";
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
        <div class="meta-item"><span>ASN</span><strong>${e.asn ? `AS${esc(e.asn)}` : "Not provided"}</strong></div>
      </div>
      <div class="card-footer"><span class="country-tag">${esc(e.latitude ?? "—")}, ${esc(e.longitude ?? "—")}</span><button class="copy-ip" data-copy="${esc(e.ip)}">Copy IP</button></div>
    </article>`).join("");
  emptyState.classList.toggle("hidden", items.length !== 0);
  results.classList.toggle("hidden", items.length === 0);
  results.querySelectorAll("[data-copy]").forEach(button => {
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copy);
        button.textContent = "Copied!";
        setTimeout(() => button.textContent = "Copy IP", 1200);
      } catch (_) {
        button.textContent = button.dataset.copy;
      }
    });
  });
}

async function loadResults() {
  const params = new URLSearchParams({ limit: "100" });
  if (searchInput.value.trim()) params.set("q", searchInput.value.trim());
  if (countryFilter.value) params.set("country", countryFilter.value);

  try {
    const data = await getJson(`${API}/search?${params}`);
    renderResults(data.results || []);
    databaseState.classList.add("hidden");
  } catch (error) {
    renderResults([]);
    databaseState.textContent = `Search is unavailable: ${error.message}`;
    databaseState.classList.remove("hidden");
  }
}

function openModal() {
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  formMessage.classList.add("hidden");
  ipInput.focus();
  document.body.style.overflow = "hidden";
}
function closeModal() {
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  formMessage.classList.add("hidden");
  submitButton.disabled = false;
  submitButton.textContent = "Geolocate + verify + add";
}

function setMessage(text, error = false) {
  formMessage.textContent = text;
  formMessage.classList.remove("hidden");
  formMessage.style.color = error ? "#ff9e9e" : "";
  formMessage.style.background = error ? "rgba(255,110,110,.08)" : "";
}

searchForm.addEventListener("submit", e => {
  e.preventDefault();
  loadResults();
  document.getElementById("directory").scrollIntoView({behavior:"smooth"});
});
searchInput.addEventListener("input", () => {
  clearTimeout(window.__pingmapSearchTimer);
  window.__pingmapSearchTimer = setTimeout(loadResults, 180);
});
countryFilter.addEventListener("change", loadResults);
document.getElementById("clear-search").addEventListener("click", () => {
  searchInput.value = "";
  countryFilter.value = "";
  loadResults();
});
document.addEventListener("keydown", e => {
  if (e.key === "/" && document.activeElement.tagName !== "INPUT") { e.preventDefault(); searchInput.focus(); }
  if (e.key === "Escape") closeModal();
});
document.getElementById("open-submit-top").addEventListener("click", openModal);
document.getElementById("open-submit-main").addEventListener("click", openModal);
document.getElementById("close-submit").addEventListener("click", closeModal);
modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });

document.getElementById("use-my-ip").addEventListener("click", async () => {
  try {
    const data = await getJson(`${API}/my-ip`);
    if (data.ip) ipInput.value = data.ip;
    else setMessage("Cloudflare did not expose a public client IP for this request.", true);
  } catch (error) {
    setMessage(error.message, true);
  }
});

document.getElementById("submit-form").addEventListener("submit", async e => {
  e.preventDefault();
  const ip = ipInput.value.trim();
  if (!ip) {
    setMessage("Enter a public IP address first.", true);
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Checking geolocation + reachability…";
  setMessage("Looking up the IP and running an ICMP reachability check. This may take a few seconds.");

  try {
    const data = await getJson(`${API}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ip })
    });
    const item = data.entry;
    setMessage(`Added ${item.ip} — ${item.city_name}, ${item.region_name}, ${item.country_name}. Ping average: ${data.ping.avgMs ?? "—"} ms.`);
    await Promise.all([loadStats(), loadResults(), loadCountries()]);
    submitButton.textContent = "Added!";
  } catch (error) {
    setMessage(error.message, true);
    submitButton.disabled = false;
    submitButton.textContent = "Geolocate + verify + add";
  }
});

(async function init() {
  await loadStats();
  await loadResults();
  await loadCountries();
})();
