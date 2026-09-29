import { useEffect, useState, useCallback } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import API from '../api';
import {
  CATEGORY_COLORS, CATEGORY_LABELS, formatShortDate,
} from '../utils';

const CHART_TOOLTIP = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-normal)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--text-primary)',
};

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [days, setDays] = useState(7);
  const [ingesting, setIngesting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [s, a] = await Promise.all([
        API.get('/detections/stats', { params: { days } }),
        API.get('/alerts', { params: { limit: 6 } }),
      ]);
      setStats(s.data.data);
      setAlerts(a.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load dashboard data — is the backend running?');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const triggerIngest = async () => {
    setIngesting(true);
    try {
      try { await API.post('/ingest/trigger', { days: 1 }); }
      catch { await API.post('/ingest/demo'); }
      await load();
    } finally {
      setIngesting(false);
    }
  };

  const total = stats?.total ?? 0;
  const highFrp = stats?.high_frp ?? 0;
  const anomalous = stats?.anomalous ?? 0;
  const catData = (stats?.by_category || []).map((c) => ({
    name: CATEGORY_LABELS[c._id] || c._id,
    key: c._id,
    value: c.count,
  }));
  const trendData = (stats?.daily_trend || []).map((d) => ({
    date: formatShortDate(d._id),
    detections: d.count,
    avg_frp: Math.round((d.avgFrp || 0) * 10) / 10,
  }));
  const stateData = (stats?.by_state || []).map((s) => ({ name: s._id || 'Unknown', count: s.count }));

  return (
    <div className="page-content">
      {/* ── Header row ──────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ fontSize: 18 }}>Mission Overview</h2>
          <select
            className="filter-select"
            style={{ width: 140 }}
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
          >
            <option value={1}>Last 24 hours</option>
            <option value={3}>Last 3 days</option>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        </div>
        <button className="btn btn-secondary" onClick={triggerIngest} disabled={ingesting}>
          {ingesting ? '⏳ Refreshing…' : '📡 Refresh FIRMS data'}
        </button>
      </div>

      {error && (
        <div className="alert-ticker" style={{ color: 'var(--accent-red)' }}>⚠️ {error}</div>
      )}

      {/* ── Stat cards ──────────────────────────────────────── */}
      <div className="grid-stats">
        <div className="stat-card" style={{ '--accent-color': 'var(--accent-orange)' }}>
          <span className="stat-icon">🔥</span>
          <div className="stat-value">{loading ? '—' : total.toLocaleString('en-IN')}</div>
          <div className="stat-label">Detections ({days}d)</div>
        </div>
        <div className="stat-card" style={{ '--accent-color': 'var(--accent-red)' }}>
          <span className="stat-icon">⚡</span>
          <div className="stat-value">{loading ? '—' : highFrp.toLocaleString('en-IN')}</div>
          <div className="stat-label">High FRP (&gt;100 MW)</div>
        </div>
        <div className="stat-card" style={{ '--accent-color': 'var(--accent-yellow)' }}>
          <span className="stat-icon">🚨</span>
          <div className="stat-value">{loading ? '—' : anomalous.toLocaleString('en-IN')}</div>
          <div className="stat-label">Anomalous</div>
        </div>
        <div className="stat-card" style={{ '--accent-color': 'var(--accent-blue)' }}>
          <span className="stat-icon">🏭</span>
          <div className="stat-value">
            {loading ? '—' : (stats?.by_category || []).filter((c) => (c._id || '').startsWith('Industrial')).reduce((a, c) => a + c.count, 0).toLocaleString('en-IN')}
          </div>
          <div className="stat-label">Industrial class</div>
        </div>
      </div>

      {/* ── Charts row ──────────────────────────────────────── */}
      <div className="grid-2">
        <div className="card">
          <div className="card-header"><span className="card-title">Detection trend</span></div>
          <div className="card-body">
            {trendData.length === 0 ? (
              <div className="empty-state"><div className="empty-icon">📈</div><div className="empty-text">No detections in this window</div></div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={trendData} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradDet" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f97316" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#475569' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#475569' }} allowDecimals={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP} />
                  <Area type="monotone" dataKey="detections" stroke="#f97316" strokeWidth={2} fill="url(#gradDet)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Source categories</span></div>
          <div className="card-body">
            {catData.length === 0 ? (
              <div className="empty-state"><div className="empty-icon">🥧</div><div className="empty-text">No classified events yet</div></div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={catData} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2}
                  >
                    {catData.map((c) => (
                      <Cell key={c.key} fill={CATEGORY_COLORS[c.key] || '#64748b'} stroke="rgba(0,0,0,0.3)" />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={CHART_TOOLTIP} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ── States + top alerts ─────────────────────────────── */}
      <div className="grid-2">
        <div className="card">
          <div className="card-header"><span className="card-title">Top states by detections</span></div>
          <div className="card-body">
            {stateData.length === 0 ? (
              <div className="empty-state"><div className="empty-icon">🗺️</div><div className="empty-text">No state data</div></div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(220, stateData.length * 34)}>
                <BarChart data={stateData} layout="vertical" margin={{ top: 0, right: 16, left: 40, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#475569' }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} width={100} />
                  <Tooltip contentStyle={CHART_TOOLTIP} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Latest alerts</span>
            <a href="/alerts" className="btn btn-ghost btn-sm">View queue →</a>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {alerts.length === 0 ? (
              <div className="empty-state"><div className="empty-icon">🔕</div><div className="empty-text">No open alerts</div></div>
            ) : (
              alerts.map((a) => (
                <div key={a._id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)',
                }}>
                  <span className={`badge badge-${(a.tier || 'info').toLowerCase()}`}>{a.tier}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {a.title}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {a.location?.state || '—'} · FRP {a.frp?.toFixed?.(1) ?? '—'} MW
                    </div>
                  </div>
                  <div style={{
                    fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                    color: a.severity_score >= 80 ? 'var(--accent-red)' : a.severity_score >= 60 ? 'var(--accent-orange)' : 'var(--accent-yellow)',
                  }}>
                    {Math.round(a.severity_score)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
