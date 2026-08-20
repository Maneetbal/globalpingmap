CREATE TABLE IF NOT EXISTS ip_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL UNIQUE,
  ip_version INTEGER NOT NULL,
  country_code TEXT,
  country_name TEXT,
  region_name TEXT,
  city_name TEXT,
  latitude REAL,
  longitude REAL,
  zip_code TEXT,
  time_zone TEXT,
  asn TEXT,
  as_name TEXT,
  isp TEXT,
  domain TEXT,
  usage_type TEXT,
  is_proxy INTEGER NOT NULL DEFAULT 0,
  is_reachable INTEGER NOT NULL DEFAULT 1,
  ping_avg_ms REAL,
  ping_loss REAL,
  ping_checked_at TEXT,
  submitted_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'community'
);

CREATE INDEX IF NOT EXISTS idx_ip_entries_country ON ip_entries(country_code);
CREATE INDEX IF NOT EXISTS idx_ip_entries_region ON ip_entries(country_code, region_name);
CREATE INDEX IF NOT EXISTS idx_ip_entries_city ON ip_entries(country_code, region_name, city_name);
CREATE INDEX IF NOT EXISTS idx_ip_entries_asn ON ip_entries(asn);
CREATE INDEX IF NOT EXISTS idx_ip_entries_submitted ON ip_entries(submitted_at DESC);
