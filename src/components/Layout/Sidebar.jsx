import {
  Home, Sliders, Activity, Map, AlertTriangle,
  Network, Bell, Navigation, FileText,
  CheckCircle, MapPin,
} from 'lucide-react';
import { useSimulation } from '../../context/SimulationContext.jsx';

const NAV_ITEMS = [
  { label: 'HOME',               icon: Home,          path: '/' },
  { label: 'SCENARIO',           icon: Sliders,       path: '/scenario' },
  { label: 'SIMULATION',         icon: Activity,      path: '/simulation' },
  { label: 'FLOOD MAP',          icon: Map,           path: '/flood-map' },
  { label: 'FLOOD IMPACT',       icon: AlertTriangle, path: '/flood-impact' },
  { label: 'DRAINAGE ANALYSIS',  icon: Network,       path: '/drainage' },
  { label: 'HAZARD ALERTS',      icon: Bell,          path: '/alerts' },
  { label: 'SAFE ROUTING',       icon: Navigation,    path: '/routing' },
  { label: 'REPORTS',            icon: FileText,       path: '/reports' },
];

export default function Sidebar({ currentPath, onNavigate }) {
  const { dataStatus, hasSimulation } = useSimulation();

  return (
    <aside className="sidebar" style={{
      width: 210, background: '#faf7f2', borderRight: '1px solid #ebe4da',
      display: 'flex', flexDirection: 'column', flexShrink: 0, padding: '14px 10px',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: '#8c8275',
        letterSpacing: '0.06em', textTransform: 'uppercase',
        marginBottom: 10, paddingLeft: 8,
      }}>
        WORKFLOW NAVIGATION
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const active = currentPath === item.path;
          return (
            <button
              key={item.path}
              onClick={() => onNavigate(item.path)}
              id={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 8, fontSize: 13,
                fontWeight: active ? 800 : 700, letterSpacing: '0.03em',
                background: active ? '#dfd3bf' : 'transparent',
                color: active ? '#2e2213' : '#5c5245',
                border: 'none', cursor: 'pointer', textAlign: 'left',
                width: '100%', transition: 'all 0.15s',
              }}
            >
              <Icon size={16} color={active ? '#2e2213' : '#5c5245'} />
              {item.label}
            </button>
          );
        })}
      </nav>

    </aside>
  );
}
