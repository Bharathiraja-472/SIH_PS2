// ============================================================
//  Flood Risk Thresholds — centimeters
// ============================================================
export const FLOOD_RISK_THRESHOLDS = [
  { key: 'SAFE',     label: 'Safe',     minCm: 0,   maxCm: 5,   color: '#16a34a', bg: '#f0fdf4' },
  { key: 'WATCH',    label: 'Watch',    minCm: 5,   maxCm: 15,  color: '#d97706', bg: '#fffbeb' },
  { key: 'FLOODED',  label: 'Flooded',  minCm: 15,  maxCm: 30,  color: '#ea580c', bg: '#fff7ed' },
  { key: 'SEVERE',   label: 'Severe',   minCm: 30,  maxCm: 50,  color: '#dc2626', bg: '#fef2f2' },
  { key: 'CRITICAL', label: 'Critical', minCm: 50,  maxCm: Infinity, color: '#7c3aed', bg: '#f5f3ff' },
];

export function getRiskLevel(depthCm) {
  return FLOOD_RISK_THRESHOLDS.find(t => depthCm >= t.minCm && depthCm < t.maxCm)
    || FLOOD_RISK_THRESHOLDS[FLOOD_RISK_THRESHOLDS.length - 1];
}

// Rainfall intensity for pipes (Manning's formula)
export const PIPE_CAPACITY_LPS_DEFAULT = 80;

// Runoff coefficients by land cover (direct from dataset)
export const RUNOFF_COEFFICIENTS = {
  built_up:   0.85,
  road:       0.90,
  vegetation: 0.25,
  open_land:  0.45,
  water:      0.05,
};

// DEM pilot area bounds (Chennai)
export const PILOT_BOUNDS = {
  minLat: 12.95, maxLat: 13.10,
  minLon: 80.15, maxLon: 80.265,
  centerLat: 13.027,
  centerLon: 80.215,
};
