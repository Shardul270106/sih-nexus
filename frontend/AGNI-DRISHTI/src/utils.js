// Category color mapping for map dots, badges, charts
export const CATEGORY_COLORS = {
  Industrial_Flare: '#f97316',
  Industrial_Other: '#fb923c',
  Mining_Coal: '#a78bfa',
  Agricultural: '#84cc16',
  Vegetation_Forest: '#22c55e',
  Waste_Landfill: '#facc15',
  Small_Informal: '#f472b6',
  Natural_Static: '#38bdf8',
  Artifact: '#94a3b8',
  Unresolved: '#64748b',
};

export const CATEGORY_LABELS = {
  Industrial_Flare: 'Industrial Flare',
  Industrial_Other: 'Industrial Other',
  Mining_Coal: 'Mining / Coal',
  Agricultural: 'Agricultural',
  Vegetation_Forest: 'Vegetation / Forest',
  Waste_Landfill: 'Waste / Landfill',
  Small_Informal: 'Small Informal',
  Natural_Static: 'Natural Static',
  Artifact: 'Artifact',
  Unresolved: 'Unresolved',
};

export const STATUS_COLORS = {
  Normal_Persistent: '#10b981',
  Anomalous: '#ef4444',
  Planned_Transition: '#f59e0b',
  Baseline_Unknown: '#64748b',
};

export const STATUS_LABELS = {
  Normal_Persistent: 'Normal Persistent',
  Anomalous: 'Anomalous',
  Planned_Transition: 'Planned Transition',
  Baseline_Unknown: 'Baseline Unknown',
};

export const CATEGORIES = Object.keys(CATEGORY_COLORS);

export function getCategoryBadgeClass(category) {
  const map = {
    Industrial_Flare: 'badge-industrial-flare',
    Industrial_Other: 'badge-industrial-other',
    Mining_Coal: 'badge-mining',
    Agricultural: 'badge-agricultural',
    Vegetation_Forest: 'badge-vegetation',
    Waste_Landfill: 'badge-waste',
    Small_Informal: 'badge-small-informal',
    Natural_Static: 'badge-natural',
    Artifact: 'badge-artifact',
    Unresolved: 'badge-unresolved',
  };
  return map[category] || 'badge-unresolved';
}

export function getStatusBadgeClass(status) {
  if (status === 'Anomalous') return 'badge-anomalous';
  if (status === 'Normal_Persistent') return 'badge-normal';
  if (status === 'Planned_Transition') return 'badge-planned';
  return 'badge-unresolved';
}

export function getSeverityColor(score) {
  if (score >= 80) return '#ef4444';
  if (score >= 60) return '#f97316';
  if (score >= 40) return '#f59e0b';
  if (score >= 20) return '#84cc16';
  return '#10b981';
}

export function formatFRP(frp) {
  if (!frp) return '—';
  return `${Number(frp).toFixed(1)} MW`;
}

export function formatDate(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export function formatShortDate(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export function getMarkerRadius(frp) {
  if (!frp) return 5;
  if (frp > 500) return 14;
  if (frp > 200) return 11;
  if (frp > 100) return 9;
  if (frp > 50) return 7;
  if (frp > 20) return 6;
  return 5;
}
