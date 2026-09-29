import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import API from '../api';
import {
  CATEGORY_COLORS, CATEGORY_LABELS, getCategoryBadgeClass, getStatusBadgeClass,
  STATUS_LABELS, formatFRP, formatDate, getMarkerRadius, getSeverityColor
} from '../utils';

// Fix leaflet icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const INDIA_CENTER = [22.5, 82.5];
const INDIA_ZOOM = 5;

// Selected categories for filtering
const ALL_CATEGORIES = Object.keys(CATEGORY_COLORS);

export default function MapPage() {
  const [detections, setDetections] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Filters
  const [filters, setFilters] = useState({
    category: 'All',
    minFrp: '',
    days: '7',
    status: 'All',
    satellite: 'All',
  });

  const [visibleCategories, setVisibleCategories] = useState(
    ALL_CATEGORIES.reduce((acc, c) => ({ ...acc, [c]: true }), {})
  );

  const [showFacilities, setShowFacilities] = useState(true);
  const [showFilters, setShowFilters] = useState(true);
  const [showLegend, setShowLegend] = useState(true);

  const fetchData = async () => {
    try {
      setRefreshing(true);
      const params = {};
      if (filters.category !== 'All') params.category = filters.category;
      if (filters.minFrp) params.minFrp = filters.minFrp;
      if (filters.status !== 'All') params.status = filters.status;
      if (filters.satellite !== 'All') params.satellite = filters.satellite;
      if (filters.days) {
        const since = new Date(Date.now() - parseInt(filters.days) * 24 * 3600 * 1000);
        params.startDate = since.toISOString();
      }
      params.limit = 2000;

      const [detRes, facRes] = await Promise.all([
        API.get('/detections', { params }),
        API.get('/facilities/geojson'),
      ]);

      setDetections(detRes.data.data || []);
      setFacilities(facRes.data.features || []);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Map data fetch error:', err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000); // 5 min refresh
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchData reads current filters via closure
  }, [filters]);

  const handleTriggerIngest = async () => {
    try {
      setRefreshing(true);
      await API.post('/ingest/trigger', { days: 1 });
      await fetchData();
    } catch {
      // Try demo data if API key not set
      await API.post('/ingest/demo');
      await fetchData();
    }
  };

  const toggleCategory = (cat) => {
    setVisibleCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const visibleDetections = detections.filter(d =>
    visibleCategories[d.source_category] !== false
  );

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      {/* Map */}
      <MapContainer
        center={INDIA_CENTER}
        zoom={INDIA_ZOOM}
        style={{ height: '100%', width: '100%' }}
        preferCanvas={true}
        zoomControl={false}
      >
        {/* Dark base layer — Esri World Dark Gray Canvas (free, no API key) */}
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
          attribution='Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ'
          maxZoom={16}
        />

        {/* Detection markers */}
        {visibleDetections.map((d) => {
          const color = CATEGORY_COLORS[d.source_category] || '#64748b';
          const radius = getMarkerRadius(d.frp);
          const isAnomaly = d.status === 'Anomalous';

          return (
            <CircleMarker
              key={d._id}
              center={[d.latitude, d.longitude]}
              radius={radius}
              pathOptions={{
                fillColor: color,
                fillOpacity: isAnomaly ? 0.9 : 0.7,
                color: isAnomaly ? '#fff' : color,
                weight: isAnomaly ? 1.5 : 0.5,
              }}
              eventHandlers={{ click: () => {} }}
            >
              <Popup maxWidth={320} closeButton={false}>
                <DetectionPopup detection={d} />
              </Popup>
            </CircleMarker>
          );
        })}

        {/* Facility markers */}
        {showFacilities && facilities.map((f, i) => (
          <CircleMarker
            key={i}
            center={[f.geometry.coordinates[1], f.geometry.coordinates[0]]}
            radius={6}
            pathOptions={{
              fillColor: '#3b82f6',
              fillOpacity: 0.6,
              color: '#60a5fa',
              weight: 1.5,
              dashArray: '3,3',
            }}
          >
            <Popup>
              <div className="detection-popup" style={{ width: 220 }}>
                <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                  🏭 {f.properties.name}
                </p>
                <div className="popup-row">
                  <span className="popup-key">Type</span>
                  <span className="popup-value" style={{ fontSize: 11 }}>
                    {f.properties.type?.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="popup-row">
                  <span className="popup-key">Criticality</span>
                  <span className="popup-value">{f.properties.criticality}</span>
                </div>
                <div className="popup-row">
                  <span className="popup-key">Detectability</span>
                  <span className="popup-value" style={{ fontSize: 11 }}>{f.properties.detectability}</span>
                </div>
                <div className="popup-row">
                  <span className="popup-key">State</span>
                  <span className="popup-value">{f.properties.state}</span>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* ── Filter Panel ── */}
      {showFilters && (
        <div className="map-overlay" style={{ top: 12, left: 12, width: 220 }}>
          <div className="filter-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>🔍 Filters</span>
              <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px' }} onClick={() => setShowFilters(false)}>✕</button>
            </div>

            <div className="filter-group">
              <div className="filter-label">Category</div>
              <select className="filter-select" value={filters.category}
                onChange={(e) => setFilters(f => ({ ...f, category: e.target.value }))}>
                <option value="All">All Categories</option>
                {ALL_CATEGORIES.map(c => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <div className="filter-label">Min FRP (MW)</div>
              <input className="filter-input" type="number" placeholder="e.g. 20" value={filters.minFrp}
                onChange={(e) => setFilters(f => ({ ...f, minFrp: e.target.value }))} />
            </div>

            <div className="filter-group">
              <div className="filter-label">Time Range</div>
              <select className="filter-select" value={filters.days}
                onChange={(e) => setFilters(f => ({ ...f, days: e.target.value }))}>
                <option value="1">Last 24h</option>
                <option value="3">Last 3 days</option>
                <option value="7">Last 7 days</option>
                <option value="14">Last 14 days</option>
                <option value="30">Last 30 days</option>
              </select>
            </div>

            <div className="filter-group">
              <div className="filter-label">Status</div>
              <select className="filter-select" value={filters.status}
                onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}>
                <option value="All">All Statuses</option>
                <option value="Anomalous">Anomalous</option>
                <option value="Normal_Persistent">Normal Persistent</option>
                <option value="Baseline_Unknown">Baseline Unknown</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <input type="checkbox" id="showFac" checked={showFacilities}
                onChange={(e) => setShowFacilities(e.target.checked)} style={{ accentColor: '#3b82f6' }} />
              <label htmlFor="showFac" style={{ fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                Show Facilities
              </label>
            </div>

            <button className="btn btn-primary" style={{ width: '100%', marginTop: 10, justifyContent: 'center' }}
              onClick={handleTriggerIngest} disabled={refreshing}>
              {refreshing ? '⏳ Refreshing...' : '📡 Refresh FIRMS Data'}
            </button>
          </div>
        </div>
      )}

      {/* Show filters button when hidden */}
      {!showFilters && (
        <button className="btn btn-secondary map-overlay" style={{ top: 12, left: 12 }}
          onClick={() => setShowFilters(true)}>
          🔍 Filters
        </button>
      )}

      {/* ── Stats overlay ── */}
      <div className="map-overlay" style={{ top: 12, left: showFilters ? 244 : 80 }}>
        <div style={{
          background: 'rgba(13, 20, 32, 0.9)',
          backdropFilter: 'blur(12px)',
          border: '1px solid var(--border-normal)',
          borderRadius: 10,
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          fontSize: 12
        }}>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Showing </span>
            <strong style={{ color: 'var(--accent-orange)' }}>{visibleDetections.length.toLocaleString()}</strong>
            <span style={{ color: 'var(--text-muted)' }}> detections</span>
          </div>
          {refreshing && <div className="spinner" />}
          {lastUpdated && (
            <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>
              ⟳ {lastUpdated.toLocaleTimeString('en-IN')}
            </div>
          )}
        </div>
      </div>

      {/* ── Legend ── */}
      {showLegend && (
        <div className="map-overlay map-legend">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="legend-title">Source Category</div>
            <button className="btn btn-ghost btn-sm" style={{ padding: '1px 4px', fontSize: 10 }}
              onClick={() => setShowLegend(false)}>✕</button>
          </div>
          {ALL_CATEGORIES.map(cat => (
            <div
              key={cat}
              className="legend-item"
              onClick={() => toggleCategory(cat)}
              style={{ opacity: visibleCategories[cat] ? 1 : 0.35 }}
            >
              <div className="legend-dot" style={{ background: CATEGORY_COLORS[cat] }} />
              <span className="legend-label">{CATEGORY_LABELS[cat]}</span>
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 8, paddingTop: 8 }}>
            <div className="legend-title">Facilities</div>
            <div className="legend-item">
              <div className="legend-dot" style={{ background: '#3b82f6', border: '2px dashed #60a5fa', boxSizing: 'border-box' }} />
              <span className="legend-label">Industrial Facility</span>
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 8, paddingTop: 8 }}>
            <div className="legend-title">Marker Size = FRP</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {[['5px', '< 20 MW'], ['8px', '50-100 MW'], ['12px', '> 200 MW']].map(([size, label]) => (
                <div key={size} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: size, height: size, borderRadius: '50%', background: '#f97316' }} />
                  <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!showLegend && (
        <button className="btn btn-secondary map-overlay" style={{ bottom: 32, left: 12 }}
          onClick={() => setShowLegend(true)}>
          🗺️ Legend
        </button>
      )}

      {/* ── Data-as-of banner ── */}
      <div className="map-overlay" style={{ bottom: 8, left: '50%', transform: 'translateX(-50%)' }}>
        <div style={{
          background: 'rgba(13, 20, 32, 0.85)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 20,
          padding: '4px 14px',
          fontSize: 10,
          color: 'var(--text-muted)',
          backdropFilter: 'blur(8px)'
        }}>
          📡 FIRMS VIIRS NRT · India · Not a real-time first-alert system — screening tool only
          {lastUpdated && ` · Data as of ${lastUpdated.toLocaleString('en-IN')}`}
        </div>
      </div>
    </div>
  );
}

function DetectionPopup({ detection: d }) {
  return (
    <div className="detection-popup">
      <div className="popup-header">
        <span className="popup-title">
          🔥 Detection #{String(d._id).slice(-6)}
        </span>
        <span className={`badge ${getCategoryBadgeClass(d.source_category)}`}>
          {CATEGORY_LABELS[d.source_category] || d.source_category}
        </span>
      </div>

      <div className="popup-row">
        <span className="popup-key">Status</span>
        <span className={`badge ${getStatusBadgeClass(d.status)}`}>
          {STATUS_LABELS[d.status] || d.status}
        </span>
      </div>
      <div className="popup-row">
        <span className="popup-key">FRP</span>
        <span className="popup-value" style={{ color: '#f97316' }}>{formatFRP(d.frp)}</span>
      </div>
      <div className="popup-row">
        <span className="popup-key">Confidence</span>
        <span className="popup-value">{((d.confidence_score || 0) * 100).toFixed(0)}%</span>
      </div>
      <div className="popup-row">
        <span className="popup-key">Severity</span>
        <div style={{ flex: 1, marginLeft: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div className="severity-meter" style={{ flex: 1 }}>
              <div className="severity-bar" style={{
                width: `${d.severity_score || 0}%`,
                background: getSeverityColor(d.severity_score)
              }} />
            </div>
            <span className="popup-value">{d.severity_score || 0}</span>
          </div>
        </div>
      </div>
      <div className="popup-row">
        <span className="popup-key">Location</span>
        <span className="popup-value" style={{ fontSize: 10 }}>
          {d.latitude?.toFixed(3)}°, {d.longitude?.toFixed(3)}°
        </span>
      </div>
      <div className="popup-row">
        <span className="popup-key">State</span>
        <span className="popup-value">{d.state || '—'}</span>
      </div>
      <div className="popup-row">
        <span className="popup-key">Date (IST)</span>
        <span className="popup-value" style={{ fontSize: 10 }}>{formatDate(d.acq_date)}</span>
      </div>
      <div className="popup-row">
        <span className="popup-key">Satellite</span>
        <span className="popup-value">{d.satellite || '—'}</span>
      </div>
      {d.nearest_facility?.name && (
        <div className="popup-row">
          <span className="popup-key">Nearest Facility</span>
          <span className="popup-value" style={{ fontSize: 10 }}>
            {d.nearest_facility.name}<br />
            <span style={{ color: 'var(--text-muted)' }}>{d.nearest_facility.distance_km} km</span>
          </span>
        </div>
      )}

      {d.shap_reasons?.length > 0 && (
        <div className="popup-reasons" style={{ marginTop: 10 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 5, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            AI Reasons
          </div>
          {d.shap_reasons.slice(0, 3).map((r, i) => (
            <div key={i} className="popup-reason-item">{r}</div>
          ))}
        </div>
      )}
    </div>
  );
}
