import { useEffect, useState, useCallback } from 'react';
import API from '../api';
import { CATEGORY_LABELS, getSeverityColor, formatDate } from '../utils';

const STATUS_FILTERS = ['All', 'Open', 'Acknowledged', 'Resolved', 'Dismissed'];
const TIER_FILTERS = ['All', 'Priority', 'Standard', 'Info'];

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ status: 'Open', tier: 'All' });
  const [selected, setSelected] = useState(null);
  const [actionMsg, setActionMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { limit: 100 };
      if (filters.status !== 'All') params.status = filters.status;
      if (filters.tier !== 'All') params.tier = filters.tier;
      const { data } = await API.get('/alerts', { params });
      setAlerts(data.data || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load alerts');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const act = async (id, status) => {
    try {
      await API.patch(`/alerts/${id}`, { status });
      setActionMsg(`Alert ${status.toLowerCase()}`);
      setSelected(null);
      await load();
      setTimeout(() => setActionMsg(''), 2500);
    } catch (err) {
      setActionMsg(err.response?.data?.message || 'Action failed — sign in as an analyst account');
      setTimeout(() => setActionMsg(''), 3000);
      if (err.response?.status === 401) setSelected(null);
    }
    setSelected(null);
  };

  return (
    <div className="page-content">
      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 18, marginRight: 'auto' }}>
          Alert Queue <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>({total} total)</span>
        </h2>
        <select className="filter-select" style={{ width: 150 }} value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
          {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="filter-select" style={{ width: 140 }} value={filters.tier}
          onChange={(e) => setFilters((f) => ({ ...f, tier: e.target.value }))}>
          {TIER_FILTERS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button className="btn btn-secondary btn-sm" onClick={load}>⟳ Refresh</button>
      </div>

      {actionMsg && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: 8, padding: '8px 14px', fontSize: 12, color: 'var(--accent-green)',
        }}>
          ✓ {actionMsg}
        </div>
      )}
      {error && <div className="alert-ticker">⚠️ {error}</div>}

      <div className="grid-2" style={{ gridTemplateColumns: 'minmax(0, 1fr) 340px', flex: 1, minHeight: 0 }}>
        {/* ── Alert list ─────────────────────────────────────── */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          <div className="card-header">
            <span className="card-title">Ranked by severity</span>
            {loading && <div className="spinner" style={{ width: 14, height: 14 }} />}
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Alert</th>
                  <th>Category</th>
                  <th>Tier</th>
                  <th>Status</th>
                  <th>Raised</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a._id} onClick={() => setSelected(a)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="severity-meter" style={{ width: 44 }}>
                          <div className="severity-bar" style={{ width: `${a.severity_score}%`, background: getSeverityColor(a.severity_score) }} />
                        </div>
                        <strong style={{ fontFamily: "'JetBrains Mono', monospace", color: getSeverityColor(a.severity_score) }}>{Math.round(a.severity_score)}</strong>
                      </div>
                    </td>
                    <td>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{a.title}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Event {a.event_id || '—'}</div>
                    </td>
                    <td><span className="badge" style={{ background: 'rgba(255,255,255,0.05)' }}>{CATEGORY_LABELS[a.category] || a.category}</span></td>
                    <td><span className={`badge badge-${(a.tier || 'info').toLowerCase()}`}>{a.tier}</span></td>
                    <td style={{ fontSize: 11 }}>{a.status}</td>
                    <td style={{ fontSize: 10 }}>{formatDate(a.createdAt)}</td>
                  </tr>
                ))}
                {alerts.length === 0 && !loading && (
                  <tr><td colSpan={6}>
                    <div className="empty-state"><div className="empty-icon">✅</div><div className="empty-text">No alerts match this filter</div></div>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Detail drawer ──────────────────────────────────── */}
        <div className="card" style={{ alignSelf: 'start', position: 'sticky', top: 0 }}>
          {!selected ? (
            <div className="empty-state">
              <div className="empty-icon">🔍</div>
              <div className="empty-text">Select an alert</div>
              <div className="empty-sub">Click a row to review the classified event, its AI reasons, and take action.</div>
            </div>
          ) : (
            <>
              <div className="card-header">
                <span className="card-title">Alert review</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>✕</button>
              </div>
              <div className="card-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{
                    fontSize: 26, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                    color: getSeverityColor(selected.severity_score),
                  }}>{Math.round(selected.severity_score)}</div>
                  <div>
                    <span className={`badge badge-${(selected.tier || 'info').toLowerCase()}`}>{selected.tier}</span>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                      {selected.location?.lat?.toFixed?.(3)}°, {selected.location?.lng?.toFixed?.(3)}° · {selected.location?.state}
                    </div>
                  </div>
                </div>

                <p style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 12 }}>{selected.title}</p>
                {selected.description && (
                  <div className="popup-reasons" style={{ marginTop: 0, marginBottom: 12 }}>
                    {String(selected.description).split('. ').filter(Boolean).map((r, i) => (
                      <div key={i} className="popup-reason-item">{r.replace(/\.$/, '')}</div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => act(selected._id, 'Acknowledged')}>Acknowledge</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => act(selected._id, 'Resolved')}>Resolve</button>
                  <button className="btn btn-danger btn-sm" onClick={() => act(selected._id, 'Dismissed')}>Dismiss</button>
                </div>
                {selected.status !== 'Open' && (
                  <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                    Current status: <strong>{selected.status}</strong>
                    {selected.acknowledged_by?.name && ` · by ${selected.acknowledged_by.name}`}
                  </div>
                )}
                <a
                  className="btn btn-ghost btn-sm"
                  style={{ marginTop: 12 }}
                  href={`/map?alert=${selected._id}`}
                >
                  🗺️ View on map
                </a>
              </div>
              </>
          )}
        </div>
      </div>
    </div>
  );
}
