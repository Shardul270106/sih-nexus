# AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources

**SIH Problem Statement ID:** 26162
**Organisation:** National Technical Research Organisation (NTRO)
**Category:** Software | **Theme:** Disaster Management
**Version:** 2.0 (revised after NTRO-style technical review)

---

## 1. Problem Statement

NASA FIRMS reports where a thermal anomaly is, but not what is causing it. Industrial flares, furnaces, mining fires, crop burning, landfill fires, wildfires, and false detections all appear as the same kind of hotspot.

**Required deliverables**
1. Classify and segregate industrial fires from forest fires and other natural fires.
2. A GIS-based solution for data storage and for visualizing outputs as map overlays.

## 2. Solution Summary

A sovereign, wide-area **thermal source characterization and screening system**. It:

- explains what each FIRMS detection most likely is,
- learns what is normal for each facility,
- flags deviations for analyst verification,
- states clearly what it cannot see.

**What it is not:** a real-time first-alert response tool. Polar-orbiter revisit, FIRMS NRT delay of hours, and the 375 m pixel bound what is possible. The UI and documentation say so explicitly.

## 3. Two-Axis Output

Every event receives a source category, a behavior status, and flags.

| Axis | Values |
|---|---|
| **Source category** | Industrial flare/combustion, Industrial other (steel, coke, kiln), Mining/coal fire, Agricultural burning, Vegetation/forest, Waste/landfill, Small informal (brick kiln, crematorium), Natural static (volcano/geothermal), Artifact (solar, glint, hot terrain), Unresolved |
| **Status** | Normal-persistent, Anomalous (spike / new activity / prolonged / abnormal pattern), Planned-transition (start-up, shutdown), Baseline unknown |
| **Flags** | Compound event, Facility-footprint hit, Observation gap, Reference-data uncertain, Verification (pending / confirmed / unavailable) |

Each output also carries a **calibrated confidence**, a **severity score**, and **human-readable reasons** (SHAP top features plus fired rules).

**MVP model targets:** Industrial, Mining, Agriculture, Vegetation, Waste, plus Unresolved. Small informal, natural static, and artifact classes stay rule-based, because FIRMS data alone cannot separate them reliably.

## 4. Detectability Prior

| Facility / source | Detectability (VIIRS-class) | Notes |
|---|---|---|
| Gas flares (refinery, oil and gas, LNG) | High | Continuous or intermittent, strong signal |
| Blast furnace, coke oven, slag dumping | Moderate to high | Variable signature |
| Coal seam and stockpile fires | High | Jharia-type, persistent |
| Large storage tank or plant fires | Moderate | Only if large and long enough to catch an overpass |
| Thermal power plant (normal operation) | Low | Insulated boilers; coal-yard and ash fires are the detectable part |
| Cement kiln | Low to marginal | Mostly enclosed |
| Small factory and warehouse fires | Very low | Usually below pixel threshold |

**Rule:** no detection is never shown as "no incident". The UI shows "not observable at this sensitivity" for low-detectability sites and "observation gap" for cloud or overpass gaps. Priors are expert-reviewed and calibrated against historical detections.

## 5. Data Sources

| Role | Primary | Cross-check / optional |
|---|---|---|
| Thermal | NASA FIRMS bulk files (VIIRS S-NPP, NOAA-20, NOAA-21; MODIS) | INSAT via MOSDAC for large-event cadence; VIIRS Nightfire (optional, verify terms) |
| Benchmark | FSI Forest Fire Alert System | n/a |
| Land cover | ESA WorldCover (10 m), ISRO Bhuvan LULC | Dynamic World (optional) |
| Facilities | OSM, Global Energy Monitor, Overture Maps, government lists (CPCB, PNGRB, Coal India) | Analyst-curated additions |
| Imagery | Sentinel-2 (SWIR B11/B12), Landsat 8/9, Sentinel-1 SAR | Indian EO data where accessible |
| Context | ERA5/GFS wind, WorldPop/GHSL population, weather | Sentinel-5P (regional context only) |
| Off by default | Google Earth Engine, live GDELT | Enable only in the low-side zone |

**Data source verification sheet (required before any dependency is committed):** product version, `type` field availability, API limits, latency, license, and access terms.

**FIRMS key fields:** `latitude`, `longitude`, `bright_ti4`, `bright_ti5`, `frp`, `confidence` (VIIRS l/n/h vs MODIS 0-100), `daynight`, `scan`, `track`, `acq_date`, `acq_time` (UTC), `satellite`, `type` (where populated).

## 6. Architecture

### 6.1 Network zones (sovereignty and OPSEC)

```
LOW SIDE (internet-connected staging)          HIGH SIDE (secure, on-prem, air-gapped)
+-------------------------------+   one-way    +--------------------------------------+
| Bulk fetchers (FIRMS, S2, WX) |  transfer /  | Ingest verifier -> Raw store         |
| Country/region-wide files     |  data diode  | PostGIS, Feature engine, Models      |
| Checksums, malware scan       | -----------> | FastAPI, Tiles, Web GIS, Alerts      |
| NO facility or AOI queries    |              | Facility layer lives ONLY here       |
+-------------------------------+              +--------------------------------------+
```

- The low side fetches **whole-country bulk files** with a fixed margin around India and never queries per site, so external services cannot learn what is being watched.
- The facility layer, analyst feedback, watchlists, and alerts never leave the high side.
- Imagery is fetched in bulk by tile. Chips are cut around events on the high side. Rolling retention limits storage.
- **Offline mode:** media-based transfer, periodic imports, and a "data as of" banner.

### 6.2 Processing pipeline

```
Bulk ingest -> Validate/dedupe -> Event clustering -> Persistence analysis
   -> Context features -> Rule engine -> LightGBM + calibration + abstention
   -> Anomaly engine -> Verification (non-blocking) -> Severity scoring
   -> Analyst review -> Alerts / Map / Reports -> Feedback (staged)
```

### 6.3 Stack (trimmed)

| Layer | Choice |
|---|---|
| Scheduler | Cron or Prefect |
| Storage | PostGIS (time-partitioned, H3-indexed), file storage for COGs |
| Backend | FastAPI |
| Tiles / OGC | Martin for vector tiles; OGC WMS/WFS via QGIS Server |
| Frontend | React, MapLibre GL, deck.gl (heatmap only), Recharts |
| ML | scikit-learn, LightGBM, SHAP, MLflow |
| Auth | Keycloak or equivalent OIDC provider |
| Ops | Docker Compose (Kubernetes only if scale demands), Prometheus/Grafana |

**Removed for now:** TimescaleDB, GeoServer, TiTiler, Airflow, CNN fusion. Each removal reduces attack surface and patch burden.

## 7. Pipeline Stages in Detail

### Stage 0: Ingestion
- Bulk FIRMS files on a fixed schedule (15-30 minute polling on the low side, transferred in batches).
- Convert UTC to IST, validate schema, deduplicate, and checksum.
- Halt the affected source on schema or product-version change, and notify the admin.

### Stage 1: Event building
- Space-time DBSCAN (about 750 m and 6-12 hours) merges detections from multiple satellites into one event.
- Per event: cluster size, total FRP, growth, shape (linear front vs compact spot).

### Stage 2: Persistence analysis
- Static-source mask built from 3-5 years of archive data.
- Detection-day counts per 375 m cell over rolling windows.
- Persistent repeatable heat points to industrial, kiln, landfill, or volcano. Transient, moving, or seasonal heat points to vegetation or agriculture.

### Stage 3: Context features
- Distance to nearest industrial polygon, facility type, criticality (computed in UTM, EPSG:32643/32644, never in degrees).
- Land-cover fractions in 375 m and 1 km buffers.
- Cropland fraction, distance to forest boundary, NDVI/NBR change.
- Seasonality and a state-wise crop-burning calendar.
- FRP, Ti4 minus Ti5, day/night, scan angle.

### Stage 4: Classification (layered)

**Rule priority order**
1. **Facility-footprint hit with no prior thermal history:** top-priority anomaly, never a low-confidence vegetation fire.
2. Known static-source mask match: category from facility type, status from baseline.
3. Known artifact mask (solar farms, hot terrain): Artifact.
4. Seasonal and land-cover rules for agriculture and vegetation.
5. Everything else goes to the model. Below the confidence threshold, the event is **Unresolved**.

**Model layer:** LightGBM on tabular features, isotonic or Platt calibration, abstention, SHAP explanations, MLflow-tracked versions.

### Stage 5: Anomaly engine (per-facility baseline by season and hour)
- **Spike:** robust z-score or EWMA on FRP and detection frequency.
- **New activity:** detection in a footprint with no history.
- **Prolonged:** persistence beyond the facility's typical duration.
- **Planned-transition:** start-up and shutdown patterns, labeled separately (FRP drop to zero is likely maintenance, not an incident).
- **Baseline unknown:** history under 12 months, with conservative thresholds and a visible label.

### Stage 6: Verification (never blocks an alert)
`Pending -> Confirmed / Not-confirmed / Unavailable (cloud, no pass)`
- Sentinel-2 or Landsat SWIR check with before/after chip when a clear scene exists.
- Sentinel-1 SAR as supporting structural-change evidence during monsoon.
- Sentinel-5P as a regional context layer only, not single-facility proof.
- Alert cards show verification state and age of the latest imagery.

### Stage 7: Severity score (0-100)
Combines FRP and growth, facility criticality, population within 5 km, wind direction toward populated areas, and verification status. Weights are admin-configurable, and the factor breakdown is shown to the analyst.

### Stage 8: Human in the loop
Analysts confirm, reclassify, dismiss, or escalate. Corrections go to a staging table (see Section 10).

## 8. Training Data and Label Integrity

**Principle:** labels and model inputs must be independent, and the test set must be sealed.

| Data role | Source | Rules |
|---|---|---|
| **Gold set** (evaluation only) | Human labels from imagery inspection (Sentinel-2 SWIR, before/after) plus documented incident reports | Never used for training or threshold tuning; stored sealed |
| **Training set** | Gold-set training split plus weak labels for pretraining | Weak labels down-weighted, from labeling functions using features the model does not receive |
| **Rule baseline** | Rules alone | Reported as comparison, never as truth |

**Gold set protocol**
- 600-1,000 events, stratified by category, region, season, and confidence, with rare classes deliberately over-sampled.
- Two independent annotators, blinded to model and rule outputs. Target Cohen's kappa of 0.7 or higher, with a third reviewer resolving disagreements.
- Each label records evidence type and annotator confidence.
- **Temporal holdout:** the latest year is sealed. **Spatial holdout:** whole states or districts are excluded from training.
- Classes with insufficient support (real industrial accidents) are reported as case studies with recall on the documented list, marked "not statistically validated".
- Class imbalance: class weights or focal loss, careful oversampling, PR-AUC and per-class F1 rather than accuracy.
- Tooling: Label Studio for annotation.

## 9. Validation and Acceptance Criteria

Proposed targets, to be finalized with NTRO users and measured on the sealed gold set.

| Metric | Proposed target |
|---|---|
| Precision, Industrial-persistent category | 95% or higher |
| Precision and recall, Vegetation vs Industrial | 90% or higher each |
| Recall on documented industrial incidents (within detectability) | Reported, target 70% or higher |
| New-facility-footprint alerts per day (non-season) | At or below an agreed cap (for example 25) |
| Calibration error (ECE) | 0.05 or lower |
| Abstention (Unresolved) rate | Reported; alarm above 15% |
| Ingest-to-alert latency | Reported as p50/p95, bounded by satellite NRT |
| Dashboard availability | 99% or higher |
| Reproducibility | 100% of alerts traceable to data, model, and rule versions |

**Baselines to beat:** (a) a rules-only classifier, (b) FSI forest fire alerts for the forest-vs-other question.

**Ablations:** persistence, land cover, and imagery contributions.

**Splits:** spatial block cross-validation and temporal holdout, because random splits leak through spatial autocorrelation.

**Case replays** (each reports where the system failed as well as where it worked):
Jharia coal fires, Punjab stubble season, a Similipal-type forest fire, a Delhi landfill fire, a refinery flare cluster (Jamnagar/Mumbai region), and at least one documented industrial incident.

## 10. Operations, Alerting, and Governance

### Roles

| Role | Receives | Action |
|---|---|---|
| Duty analyst | Ranked queue of anomalies and Unresolved events | Confirm / reclassify / dismiss / escalate |
| Supervisor | Escalated and high-severity alerts | Approve external notifications |
| Domain reviewer | Candidate unmapped facilities | Approve additions to the facility layer |
| Administrator | System health, model versions | Manage users, thresholds, retraining approval |

### Alert-fatigue controls
- Deduplicate by event ID; escalate only on growth or severity change.
- Tiers: **Priority** (push), **Standard** (queue), **Info** (map only).
- Agricultural events are map-only unless near critical assets, so the October-November stubble spike does not flood analysts.
- Daily alert budget monitoring triggers threshold review on overrun.

### Feedback governance
- Corrections go to a **staging table**, never directly into training.
- Retraining requires supervisor approval, label-statistics review, and confirmation that the sealed gold-set score has not regressed.
- All corrections are attributed and audit-logged.

### Interoperability
Alerts export as **CAP** and GeoJSON. Layers are served as OGC WMS/WFS for QGIS and existing NTRO systems. Channels: email, webhook, and Telegram/SMS where policy allows.

## 11. GIS Layer (Deliverable ii)

**Storage**
- PostGIS in EPSG:4326, H3-indexed, time-partitioned. Reproject to UTM for distance and buffer work.
- Rasters as Cloud Optimized GeoTIFFs.

**Core tables:** `detections`, `events`, `classifications` (class, status, confidence, model version, explanation), `facilities` (polygon, type, criticality, detectability, status), `facility_baselines`, `alerts`, `imagery_index`, `analyst_feedback` (staging), `model_registry`, `audit_log`.

**Web UI**
- Class and status layer toggles, time slider with playback.
- Filters: state, confidence, FRP, satellite, date, verification state.
- Click-through event card: class, confidence, reasons, nearby facility, before/after imagery swipe.
- Facility profile: FRP time series with baseline band, detectability rating.
- "Coverage" layer showing observation gaps and low-detectability sites.
- Candidate unmapped source queue, alert feed, watchlist, AOI drawing.
- Export: GeoJSON, CSV, Shapefile, PDF incident report.
- Dark mode, responsive layout, "data as of" banner. Hindi labels are a later tier.

## 12. Security and Deployment

1. On-premises, offline install, internal package mirror, signed container images.
2. RBAC with per-layer and per-site visibility, and **site masking** for sensitive installations.
3. Immutable audit log of views, exports, and changes; export controls and watermarking.
4. Encryption at rest and in transit, with documented key management.
5. SBOM generation and vulnerability scanning in CI.
6. Backup and disaster recovery; a defined data classification for outputs. The aggregated map of persistent sources is itself sensitive.
7. License compliance: OSM ODbL (attribution and share-alike review), WorldCover CC-BY, FIRMS and Sentinel terms.
8. Area of interest is a configurable setting. Border-area detections are flagged, not silently dropped.

## 13. Edge Cases Checklist

**Satellite and data quality**
- FIRMS NRT latency of up to about 3 hours; gaps between overpasses.
- Cloud cover and monsoon (June-September): flag "observation gap", use SAR, never claim "no fire".
- Bow-tie pixel growth off-nadir and geolocation offset of a few hundred meters.
- Duplicates across satellites; MODIS vs VIIRS resolution mismatch.
- Differing confidence encodings; saturation at very hot sources (flares); Ti4 vs Ti5 behavior.
- API outages, rate limits, expired keys: retries, backoff, cache, "last updated" indicator.
- UTC vs IST and CRS errors.

**False positives**
- Solar farms, bright metal roofs, sun glint, hot bare desert or rock, sunlit slopes.
- Offshore platforms and flares (Mumbai High), ships.
- Volcanic and geothermal sources (for example Barren Island).

**Ambiguous or mixed situations**
- Mixed pixels at forest-industry edges and mines inside forest boundaries.
- Stubble burning near industrial estates; landfills inside industrial zones.
- Coal stockpile self-heating and Jharia-type underground fires.
- Wildfire spreading into a facility or a factory fire igniting vegetation: compound event, multi-label with a primary class.
- Brick kilns, crematoria, festival bonfires.
- Planned flaring, start-up, and shutdown labeled as "flaring event", not fire.

**Reference data problems**
- OSM incompleteness in India: supplement with GEM, Overture, and government lists. Persistent hotspots outside known polygons become **candidate unmapped industrial sources** for analyst review.
- Zombie (closed) plants and newly built ones: use recent-persistence checks to update status.
- Polygon misalignment: buffer tolerance scaled to pixel size plus geolocation error, with "reference uncertain" flag.

**Modeling**
- Regional and seasonal distribution shift, concept drift, rare-class scarcity.
- Overconfidence: calibrate and abstain.
- Spatial autocorrelation leakage: spatial and temporal splits.
- Model version tracking so every alert is reproducible.

## 14. Reliability and Failure Modes

| Failure | System behavior |
|---|---|
| FIRMS feed or transfer stops | "Data as of" banner turns red; last good data served |
| Sensor outage or product version change | Ingest validator halts the source and notifies admin |
| Cloud or monsoon gap | "Observation gap" flag, SAR fallback, no "all clear" |
| Facility polygon wrong or missing | Buffer tolerance, "reference uncertain" flag, routed to review |
| Model drift | Weekly drift dashboard; automatic switch to rules-only mode past threshold |
| Component down | No imagery means tabular-only; no model means rules-only |

## 15. Sustainability

**Technical**
- Free, open data and open-source software; no licence costs.
- Containerized, CI/CD via GitHub Actions or an on-prem equivalent.
- MLflow model registry, scheduled retraining under approval, drift monitoring, Prometheus/Grafana.
- Modular services so any data source or model can be swapped.

**Cost:** MVP runs on one mid-size server (about 8 vCPU, 32 GB RAM, 1-2 TB storage). A GPU is needed only if the CNN tier is added.

**Operational:** documented data lineage, versioned datasets, analyst feedback loop with governance, graceful degradation.

**Societal and environmental:** supports flaring and emissions monitoring (SDG 13), industrial safety and resilient infrastructure (SDG 9, 11), and disaster response. CPU-friendly inference keeps compute and carbon footprint low.

## 16. Scope Tiers and Build Plan

**Tier 1, Must (the two deliverables):** bulk ingest, facility and land-cover layers, event clustering, persistence mask, rules plus LightGBM on merged categories, PostGIS storage, web map with class overlays, time slider, event detail with explanations.

**Tier 2, Should:** anomaly engine, severity scoring, verification states, RBAC, audit log, CAP/OGC export.

**Tier 3, Could:** CNN fusion on Sentinel-2 chips, Hindi UI, SMS gateway, TROPOMI context layer.

**Not now:** GEE dependency, GeoServer, Kubernetes, live GDELT.

| Phase | Weeks | Gate to pass |
|---|---|---|
| 1. Data loop and verification sheet | 1-3 | Bulk ingest works on 3 states; facility layer loaded |
| 2. Gold set | 3-6 | Kappa 0.7 or higher; sealed split created |
| 3. Rules and model | 6-9 | Beats rules-only baseline on the gold set |
| 4. GIS front end | 7-11 | Tier 1 demo-ready |
| 5. Anomaly, verification, alerts | 11-14 | Alert budget and acceptance targets measured |
| 6. Security hardening and pilot | 14-16 | Audit, SBOM, analyst trial |

**Hackathon cut:** 3-4 states, 5 merged categories plus Unresolved, rules plus LightGBM, an interim 200-event gold set, and replays of Jharia, Punjab stubble season, a forest fire, a Delhi landfill fire, and a refinery flare cluster, plus one live FIRMS refresh.

**Team (4-6):** data engineer, ML engineer, GIS/backend developer, frontend/map developer, domain and validation lead, documentation and pitch owner.

## 17. Review Traceability

| Review finding | Resolution | Section |
|---|---|---|
| C1 Label circularity | Sealed independent gold set, feature-separated weak labels | 8 |
| C2 Detectability overstated | Detectability prior, "not observable" wording | 4 |
| C3 Foreign dependency / OPSEC | Two-zone bulk ingest, offline mode, Indian sources | 5, 6.1 |
| C4 No acceptance criteria | Numeric targets and baselines | 9 |
| M1 Mixed taxonomy | Two-axis output plus flags | 3 |
| M2 Persistence vs incidents | Facility-footprint new-activity priority rule | 7 |
| M3 FIRMS assumptions | Data source verification sheet | 5 |
| M4 Latency honesty | Repositioned as screening and characterization | 2 |
| M5 Imagery timing | Non-blocking verification states | 7 |
| M6 Over-engineered stack | Trimmed stack | 6.3 |
| M7 Scope creep | Tiered scope | 16 |
| Security requirements | Full security section | 12 |
| Operational gaps | Roles, alert budget, feedback governance, failure modes | 10, 14 |

## 18. Known Limitations (stated honestly)

- 375 m resolution: small factory fires are often invisible.
- Polar-orbiter revisit and NRT delay mean this is not a first-alert system.
- Cloud and monsoon reduce optical verification; SAR is only supporting evidence.
- Documented Indian industrial incidents are rare, so headline accuracy on accidents cannot be claimed.
- OSM and facility data are incomplete; unmapped facilities are expected.
- The system supports analysts and ground reporting. It does not replace them.

## 19. Pitch Points

- **Clear gap:** FIRMS detects heat; this system explains it.
- **Multi-source fusion:** thermal, land cover, infrastructure, imagery, and weather.
- **Normal vs abnormal:** persistence plus per-facility anomaly baselines.
- **Discovery of unmapped sources** that fills OSM gaps.
- **Trustworthy AI:** calibrated confidence, abstention, explainability, governed feedback.
- **Deployable for NTRO:** sovereign two-zone design, OGC/CAP standards, RBAC, audit logs, site masking.
- **Honest limits:** each with a stated mitigation.

## 20. Suggested Repository Layout

```
project/
  README.md
  docs/                 # architecture, data source verification sheet, model cards
  ingest/               # bulk FIRMS/imagery fetchers (low side), ingest verifier (high side)
  db/                   # PostGIS schema, migrations
  features/             # clustering, persistence mask, context features
  rules/                # rule engine and priority logic
  models/               # training, calibration, SHAP, MLflow configs
  anomaly/              # facility baselines, spike/new-activity detectors
  verification/         # imagery chip extraction, SWIR checks
  api/                  # FastAPI services, CAP/OGC export
  web/                  # React + MapLibre front end
  gold_set/             # labeling protocol, annotation configs (data sealed)
  deploy/               # Docker Compose, offline install, SBOM, security config
  tests/
```

## 21. Immediate Next Steps

1. Write the data source verification sheet (FIRMS product versions, `type` field, limits, licenses).
2. Stand up PostGIS and load 2-3 years of FIRMS VIIRS for 3-4 pilot states.
3. Load facility layers (OSM, GEM, Overture) and ESA WorldCover; fill the detectability table with expert review.
4. Build event clustering and the persistence mask.
5. Draft the gold-set labeling protocol and begin annotation.
6. Implement the rule engine, then the LightGBM baseline evaluated on the sealed set.
7. Build the map front end and prepare the case replays.
