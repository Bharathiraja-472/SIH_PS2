// ============================================================
//  Routing Multipliers Configuration
//  Defines penalty multipliers for flood-risk levels across objectives
// ============================================================

export const font_family = 'Inter, sans-serif';

export const ROUTING_OBJECTIVES = {
  FLOOD_SAFETY: {
    key: 'FLOOD_SAFETY',
    label: 'Safest Route (Avoid Flooded Areas)',
    desc: 'Strongly penalizes flood risk & blocks critical inundations',
    multipliers: {
      SAFE: 1.0,
      WATCH: 1.5,
      FLOODED: 4.0,
      SEVERE: 15.0,
      CRITICAL: 999.0, // Effectively blocked
    },
  },
  BALANCED: {
    key: 'BALANCED',
    label: 'Balanced (Safety + Shortest)',
    desc: 'Balances travel distance and flood risk exposure',
    multipliers: {
      SAFE: 1.0,
      WATCH: 1.2,
      FLOODED: 2.2,
      SEVERE: 5.0,
      CRITICAL: 50.0,
    },
  },
  SHORTEST: {
    key: 'SHORTEST',
    label: 'Shortest Route (Ignore Flood Risk)',
    desc: 'Minimizes travel distance regardless of water depth',
    multipliers: {
      SAFE: 1.0,
      WATCH: 1.0,
      FLOODED: 1.0,
      SEVERE: 1.0,
      CRITICAL: 1.0,
    },
  },
};

// Preset locations for Chennai pilot area
export const PRESET_LOCATIONS = [
  { id: 'tnagar', name: 'T. Nagar', lat: 13.0418, lng: 80.2341, address: 'Usman Road, T. Nagar, Chennai' },
  { id: 'perambur', name: 'Perambur', lat: 13.1092, lng: 80.2458, address: 'Paper Mills Rd, Perambur, Chennai' },
  { id: 'annanagar', name: 'Anna Nagar', lat: 13.0850, lng: 80.2100, address: '2nd Avenue, Anna Nagar, Chennai' },
  { id: 'adyar', name: 'Adyar', lat: 13.0012, lng: 80.2565, address: 'LB Road, Adyar, Chennai' },
  { id: 'guindy', name: 'Guindy', lat: 13.0067, lng: 80.2020, address: 'GST Road, Guindy, Chennai' },
  { id: 'velachery', name: 'Velachery', lat: 12.9780, lng: 80.2200, address: '100 Feet Bypass Rd, Velachery' },
  { id: 'ambattur', name: 'Ambattur', lat: 13.1140, lng: 80.1540, address: 'MTH Road, Ambattur Industrial Estate' },
];
