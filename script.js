const sampleIps = [
  { ip: "142.250.72.14", country: "United States", flag: "🇺🇸", region: "California", city: "Mountain View", isp: "Google", asn: "AS15169", version: "IPv4" },
  { ip: "1.1.1.1", country: "United States", flag: "🇺🇸", region: "California", city: "San Francisco", isp: "Cloudflare", asn: "AS13335", version: "IPv4" },
  { ip: "142.250.191.14", country: "United States", flag: "🇺🇸", region: "California", city: "Mountain View", isp: "Google", asn: "AS15169", version: "IPv4" },
  { ip: "8.8.8.8", country: "United States", flag: "🇺🇸", region: "California", city: "Mountain View", isp: "Google", asn: "AS15169", version: "IPv4" },
  { ip: "9.9.9.9", country: "United States", flag: "🇺🇸", region: "New York", city: "New York", isp: "Quad9", asn: "AS19281", version: "IPv4" },
  { ip: "142.250.74.206", country: "Canada", flag: "🇨🇦", region: "Ontario", city: "Toronto", isp: "Google", asn: "AS15169", version: "IPv4" },
  { ip: "142.250.70.46", country: "Canada", flag: "🇨🇦", region: "Alberta", city: "Edmonton", isp: "Google", asn: "AS15169", version: "IPv4" },
  { ip: "208.67.222.222", country: "United States", flag: "🇺🇸", region: "California", city: "San Francisco", isp: "Cisco OpenDNS", asn: "AS36692", version: "IPv4" },
  { ip: "9.9.9.10", country: "United States", flag: "🇺🇸", region: "New York", city: "New York", isp: "Quad9", asn: "AS19281", version: "IPv4" },
  { ip: "77.88.8.8", country: "Russia", flag: "🇷🇺", region: "Moscow", city: "Moscow", isp: "Yandex", asn: "AS13238", version: "IPv4" },
  { ip: "185.228.168.9", country: "United Kingdom", flag: "🇬🇧", region: "England", city: "London", isp: "CleanBrowsing", asn: "AS399486", version: "IPv4" },
  { ip: "76.76.2.0", country: "United States", flag: "🇺🇸", region: "Virginia", city: "Ashburn", isp: "Control D", asn: "AS199524", version: "IPv4" }
];

let entries = [...sampleIps];
const customKey = "pingmap-local-submissions";

try {
  const saved = JSON.parse(localStorage.getItem(customKey) || "[]");
  if (Array.isArray(saved)) entries.push(...saved);
} catch (_) {}

const results = document.getElementById("results");
const emptyState = document.getElementById("empty-state");
const searchInput = document.getElementById("search-input");
const searchForm = document.getElementById("search-form");
const countryFilter = document.getElementById("country-filter");
const countryGrid = document.getElementById("country-grid");
const statIps = document.getElementById("stat-ips");
const statCountries = document.getElementById("stat-countries");
const statCities = document.getElementById("stat-cities");
const modal = document.getElementById("submit-modal");
const formMessage = document.getElementById("form-message");

const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

function renderStats() {
  statIps.textContent = entries.length;
  statCountries.textContent = new Set(entries.map(e => e.country)).size;
  statCities.textContent = new Set(entries.map(e => `${e.city},${e.country}`)).size;
}

function populateCountries() {
  const countries = [...new Set(entries.map(e => e.country))].sort();
  const current = countryFilter.value;
  countryFilter.innerHTML = '<option value="">All countries</option>' + countries.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  countryFilter.value = current;
}

function renderCountryGrid() {
  const grouped = {};
  entries.forEach(e => grouped[e.country] = (grouped[e.country] || 0) + 1);
  countryGrid.innerHTML = Object.entries(grouped).sort((a,b) => b[1] - a[1]).map(([country,count]) => {
    const item = entries.find(e => e.country === country);
    return `<button class="country-card" data-country="${esc(country)}"><div class="country-name"><span>${esc(item.flag || "🌐")}</span>${esc(country)}</div><div class="country-count">${count} ${count === 1 ? "entry" : "entries"}</div></button>`;
  }).join("");
  countryGrid.querySelectorAll("[data-country]").forEach(button => {
    button.addEventListener("click", () => {
      countryFilter.value = button.dataset.country;
      searchInput.value = "";
      renderResults();
      document.getElementById("directory").scrollIntoView({ behavior: "smooth" });
    });
  });
}

function renderResults() {
  const query = searchInput.value.trim().toLowerCase();
  const country = countryFilter.value;
  const filtered = entries.filter(e => {
    const haystack = [e.ip,e.country,e.region,e.city,e.isp,e.asn,e.version].join(" ").toLowerCase();
    return (!query || haystack.includes(query)) && (!country || e.country === country);
  });

  results.innerHTML = filtered.map(e => `
    <article class="ip-card">
      <div class="ip-top"><span class="ip-address">${esc(e.ip)}</span><span class="ip-version">${esc(e.version)}</span></div>
      <div class="ip-meta">
        <div class="meta-item"><span>Location</span><strong>${esc(e.city || "Unknown")}, ${esc(e.region || "")}</strong></div>
        <div class="meta-item"><span>Network</span><strong>${esc(e.isp || "Unknown")}</strong></div>
        <div class="meta-item"><span>Country</span><strong>${esc(e.country)}</strong></div>
        <div class="meta-item"><span>ASN</span><strong>${esc(e.asn || "Not provided")}</strong></div>
      </div>
      <div class="card-footer"><span class="country-tag">${esc(e.flag || "🌐")} ${esc(e.country)}</span><button class="copy-ip" data-copy="${esc(e.ip)}">Copy IP</button></div>
    </article>`).join("");

  emptyState.classList.toggle("hidden", filtered.length !== 0);
  results.classList.toggle("hidden", filtered.length === 0);
  results.querySelectorAll("[data-copy]").forEach(button => {
    button.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(button.dataset.copy); button.textContent = "Copied!"; setTimeout(() => button.textContent = "Copy IP", 1200); }
      catch (_) { button.textContent = button.dataset.copy; }
    });
  });
}

function openModal() {
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.getElementById("ip-input").focus();
  document.body.style.overflow = "hidden";
}
function closeModal() {
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  formMessage.classList.add("hidden");
}

function validIp(ip) {
  const ipv4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
  const ipv6 = /^[0-9a-f:]+$/i;
  return ipv4.test(ip) || (ip.includes(":") && ipv6.test(ip) && ip.length <= 45);
}

searchForm.addEventListener("submit", e => { e.preventDefault(); renderResults(); document.getElementById("directory").scrollIntoView({behavior:"smooth"}); });
searchInput.addEventListener("input", renderResults);
countryFilter.addEventListener("change", renderResults);
document.getElementById("clear-search").addEventListener("click", () => { searchInput.value = ""; countryFilter.value = ""; renderResults(); });
document.addEventListener("keydown", e => { if (e.key === "/" && document.activeElement.tagName !== "INPUT") { e.preventDefault(); searchInput.focus(); } if (e.key === "Escape") closeModal(); });
document.getElementById("open-submit-top").addEventListener("click", openModal);
document.getElementById("open-submit-main").addEventListener("click", openModal);
document.getElementById("close-submit").addEventListener("click", closeModal);
modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });

document.getElementById("submit-form").addEventListener("submit", e => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  if (!validIp(data.ip.trim())) {
    formMessage.textContent = "Please enter a valid IPv4 or IPv6 address.";
    formMessage.classList.remove("hidden");
    return;
  }
  if (entries.some(x => x.ip.toLowerCase() === data.ip.trim().toLowerCase())) {
    formMessage.textContent = "That IP is already in the directory.";
    formMessage.classList.remove("hidden");
    return;
  }
  const item = { ip:data.ip.trim(), country:data.country.trim(), region:data.region.trim(), city:data.city.trim(), isp:data.isp.trim(), asn:data.asn.trim(), version:data.ip.includes(":") ? "IPv6" : "IPv4", flag:"🌐" };
  entries.push(item);
  try { localStorage.setItem(customKey, JSON.stringify(entries.slice(sampleIps.length))); } catch (_) {}
  populateCountries(); renderStats(); renderCountryGrid(); renderResults();
  formMessage.textContent = "Added to this browser's local prototype directory. The shared database comes next.";
  formMessage.classList.remove("hidden");
  e.target.reset();
});

renderStats();
populateCountries();
renderCountryGrid();
renderResults();
