# 🔥 AGNI-DRISHTI — Thermal Source Intelligence System

**SIH 2026 · Problem Statement 26162 (NTRO) · Disaster Management Theme**

AI-based detection and classification of industrial fires and persistent thermal sources.
FIRMS tells you *where* heat is; AGNI-DRISHTI tells you *what* is causing it — with calibrated
confidence, human-readable reasons, per-facility anomaly status, and an honest statement of
what satellite data cannot see.

> **Not a real-time first-alert system.** Polar-orbiter revisit times and FIRMS NRT delay of
> ~3 hours bound what is possible. This is a wide-area screening and characterization tool.

---

## Quick start

### Prerequisites
- Node.js 20+
- A MongoDB — local Docker, local install, **or a MongoDB Atlas cluster**
  (set `MONGODB_URI` in `backend/.env` to your connection string)

### 1. Database
```bash
# Local Docker (default in backend/.env.example)
docker run -d --name agni-mongo -p 27017:27017 -v agni_mongo_data:/data/db mongo:7
# later: docker start agni-mongo

# ...or skip Docker entirely and point MONGODB_URI at your Atlas cluster.
```

### 2. Backend
```bash
cd backend
npm install
npm run seed              # demo admin + 17 facilities (alias: node scripts/seed.mjs)
npm run dev               # http://localhost:5000
```
On first boot, `config/envCheck.js` runs **first**: it creates `.env` from `.env.example`
if missing, fixes an invalid `PORT`, and prints warnings for any default credentials.

Without a FIRMS MAP_KEY the server automatically runs in **synthetic demo mode** — it
generates realistic detections (Jharia coal fires, Jamnagar flares, Punjab stubble,
Similipal forest, Delhi landfills), classifies them, and raises alerts.

### 3. Frontend
```bash
cd frontend/AGNI-DRISHTI
npm install
npm run dev               # http://localhost:5173 (Vite picks 5174+ if 5173 is busy)
```

> Vite auto-increments the port when 5173 is taken. The backend accepts **any**
> `localhost` / `127.0.0.1` port during development, and `CORS_ORIGIN` in
> `backend/.env` is a comma-separated allowlist for production deployments.

> `.env` files are git-ignored (see [.gitignore](.gitignore)) — never commit real
> Atlas credentials or a FIRMS API key.

### Demo login
| Email | Password | Role |
|---|---|---|
| `admin@ntro.gov.in` | `Admin@123` | admin |

Or register any new account (gets the `analyst` role).

### Optional: live NASA FIRMS data
1. Get a free MAP_KEY: <https://firms.modaps.eosdis.nasa.gov/api/map_key/>
2. Put it in `backend/.env` as `FIRMS_MAP_KEY=...`
3. Restart the backend (or press *Refresh FIRMS data* in the UI). A 30-minute
   auto-refresh cron matches the FIRMS NRT cadence.

---

## What it does

### Two-axis classification (per event)
| Axis | Values |
|---|---|
| **Source category** | Industrial Flare · Industrial Other · Mining/Coal · Agricultural · Vegetation/Forest · Waste/Landfill · Small Informal · Natural Static · Artifact · Unresolved |
| **Status** | Normal-Persistent · Anomalous · Planned-Transition · Baseline-Unknown |

Every output carries a 0–1 confidence, a 0–100 severity score, and human-readable
reasons (fired rules; SHAP-style top features).

### Rule engine (priority order)
1. FIRMS `type` field → volcano / static / offshore (artifact & natural)
2. Jharia coalfield bounding box → Mining/Coal
3. High-FRP within 2 km of a facility → category from facility type
4. Seasonal crop-burning calendar + cropland fraction → Agricultural
5. Forest fraction + transient pattern → Vegetation/Forest
6. Persistent high-FRP in industrial states → candidate unmapped source
7. Extreme FRP + high ΔBT → flare signature
8. Everything below confidence floor → **Unresolved** (abstention)

### Alert tiers
Severity ≥ 80 → **Priority**, ≥ 60 → **Standard**, else **Info**.
Agricultural-season events stay map-only unless near critical assets, so the
Oct–Nov stubble spike doesn't flood the analyst queue.

---

## Architecture

```
┌─────────────────────────────  LOW SIDE (internet)  ──────────────────────────┐
│  NASA FIRMS bulk CSV (VIIRS S-NPP / NOAA-20)  ·  country-wide bbox, no       │
│  per-site queries  ·  checksums  ·  schema validation                        │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   ▼
┌─────────────────────────────  HIGH SIDE (on-prem)  ─────────────────────────┐
│ ingest → dedupe → classify (rules + heuristic model) → context enrichment   │
│ → severity → alerting → MongoDB  ·  REST API (Express)  ·  React web GIS    │
│ facility layer & analyst feedback never leave this side                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

| Layer | Tech |
|---|---|
| Ingest & cron | Express + node-cron (30-min FIRMS poll) |
| Classification | Deterministic rule engine (`services/classifier.js`), LightGBM-swappable |
| Storage | MongoDB (Mongoose) — PostGIS-ready schema in `models/` |
| Auth | JWT + bcrypt, roles: admin / supervisor / analyst / viewer |
| Frontend | React 19, Vite, Leaflet, Recharts, react-router |
| Deploy | Docker Compose (`docker-compose.yml`) |

### API surface
| Endpoint | Purpose |
|---|---|
| `POST /api/auth/login` `POST /api/auth/register` `GET /api/auth/me` | JWT auth |
| `GET /api/detections` | Filter by category/state/FRP/date/bbox |
| `GET /api/detections/geojson` | Map-ready FeatureCollection |
| `GET /api/detections/stats` | Dashboard aggregates (trend, categories, states) |
| `GET /api/facilities` `GET /api/facilities/geojson` | Facility layer |
| `GET /api/alerts` `PATCH /api/alerts/:id` | Analyst queue + triage actions |
| `POST /api/ingest/trigger` `POST /api/ingest/demo` | Manual ingest / synthetic data |
| `GET /api/health` | Liveness + "data as of" timestamp |

---

## Repo layout
```
backend/
  config/        db.js (retry + reconnect), envCheck.js (runs FIRST), .env.example
  middleware/    auth (JWT + RBAC)
  models/        Detection, Facility, Alert, User
  routes/        auth, detections, alerts, facilities, ingest
  scripts/       seed.mjs (demo admin + facility layer)
  services/      firmsIngestion.js (live FIRMS + deterministic demo mode), classifier.js
frontend/AGNI-DRISHTI/
  src/pages/     LoginPage, DashboardPage, MapPage, AlertsPage
  src/context/   AuthContext
  app shell      App.jsx (sidebar, protected routes, lazy-loaded pages)
docker-compose.yml   full stack (mongo + backend + nginx frontend)
```

## Verified behaviour

| Check | Status |
|---|---|
| All 14 REST endpoints in the API table above | ✅ HTTP 200/201 |
| Demo login (`admin@ntro.gov.in`) | ✅ JWT issued |
| Live NASA FIRMS ingest (VIIRS S-NPP + NOAA-20) | ✅ real detections stored |
| Repeat ingest deduplication | ✅ 0 duplicates inserted |
| Detection schema round-trip (flags + nearest facility) | ✅ persists |
| Frontend lint / production build | ✅ 0 errors / builds clean |
| `docker compose config` | ✅ valid |

## Honest limitations (by design, stated in the UI)
- 375 m pixels: small factory fires are often invisible — the UI shows
  *"not observable at this sensitivity"*, never *"no incident"*.
- Cloud/monsoon gaps are flagged as observation gaps.
- Synthetic demo mode replaces live data until a FIRMS MAP_KEY is configured.
- Rule-engine explanations stand in for the production LightGBM + SHAP tier.

## Roadmap (from project.md tiers)
- **Tier 2:** per-facility seasonal baselines, verification states (S2/SAR), CAP export, audit log
- **Tier 3:** CNN fusion on Sentinel-2 chips, Hindi UI, SMS/Telegram channels
