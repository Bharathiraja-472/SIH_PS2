import { Construction } from 'lucide-react';

// Generic placeholder for pages not yet implemented
export default function PlaceholderPage({ title, onNavigate }) {
  return (
    <div className="main-content">
      <div className="empty-state" style={{ minHeight: 400, justifyContent: 'center' }}>
        <div className="empty-icon">
          <Construction size={28} color="#94a3b8" />
        </div>
        <div className="empty-title">{title}</div>
        <div className="empty-desc">
          This page is part of the UrbanFlood-X pipeline and will be implemented in the next phase.
        </div>
        <button className="btn btn-outline" onClick={() => onNavigate('/')}>← Back to Dashboard</button>
      </div>
    </div>
  );
}
