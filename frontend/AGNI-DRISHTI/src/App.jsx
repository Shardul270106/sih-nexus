import { Routes, Route, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState, lazy, Suspense } from 'react';
import { useAuth } from './context/AuthContext';
import API from './api';
import LoginPage from './pages/LoginPage';

// Code-split: heavy page-level deps (Leaflet, Recharts) load on demand
const MapPage = lazy(() => import('./pages/MapPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const AlertsPage = lazy(() => import('./pages/AlertsPage'));

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '📊', end: true },
  { to: '/map', label: 'Live Map', icon: '🗺️' },
  { to: '/alerts', label: 'Alert Queue', icon: '🔔', badge: true },
];

const PAGE_META = {
  '/': { title: 'Dashboard', subtitle: 'National thermal anomaly overview' },
  '/map': { title: 'Live Map', subtitle: 'FIRMS detections · classified and characterized' },
  '/alerts': { title: 'Alert Queue', subtitle: 'Ranked anomalies for analyst review' },
};

function ProtectedLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [openAlerts, setOpenAlerts] = useState(0);

  const meta = PAGE_META[location.pathname] || PAGE_META['/'];

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await API.get('/alerts/stats');
        if (!cancelled) setOpenAlerts(data.data?.priority_open ?? 0);
      } catch { /* backend may be down; badge stays as-is */ }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">🔥</div>
          <div className="logo-text">
            <h1>AGNI-DRISHTI</h1>
            <p>Thermal Intelligence</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-title">Operations</div>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.badge && openAlerts > 0 && <span className="nav-badge">{openAlerts}</span>}
            </NavLink>
          ))}

          <div className="nav-section-title">Reference</div>
          <a className="nav-item" href="https://firms.modaps.eosdis.nasa.gov/map/" target="_blank" rel="noreferrer">
            <span className="nav-icon">🛰️</span>
            <span>NASA FIRMS</span>
          </a>
        </nav>

        <div className="sidebar-footer">
          <div className="data-status">
            <span className="data-status-dot" />
            <strong style={{ color: 'var(--text-secondary)' }}>FIRMS VIIRS NRT</strong>
            <div style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 10 }}>
              Screening tool · not a real-time first-alert system
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'linear-gradient(135deg, #f97316, #ef4444)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 13, color: '#fff', flexShrink: 0,
            }}>
              {user?.name?.charAt(0).toUpperCase() || '?'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.name}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                {user?.role}
              </div>
            </div>
            <button className="btn btn-ghost btn-sm btn-icon" title="Sign out" onClick={handleLogout}>⏻</button>
          </div>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────── */}
      <div className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <div>
              <div className="page-title">{meta.title}</div>
              <div className="page-subtitle">{meta.subtitle}</div>
            </div>
          </div>
          <div className="topbar-right">
            <span style={{ fontSize: 10, color: 'var(--text-muted)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '4px 10px' }}>
              SIH 2026 · PS 26162 · NTRO
            </span>
          </div>
        </header>
        <Outlet />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth><ProtectedLayout /></RequireAuth>}>
        <Route path="/" element={<Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>} />
        <Route path="/map" element={<Suspense fallback={<PageLoader />}><MapPage /></Suspense>} />
        <Route path="/alerts" element={<Suspense fallback={<PageLoader />}><AlertsPage /></Suspense>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function PageLoader() {
  return (
    <div className="page-content" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" />
      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Loading module…</div>
    </div>
  );
}

function RequireAuth({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}
