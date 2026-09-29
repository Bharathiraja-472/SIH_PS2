import { Waves } from 'lucide-react';

export default function Header() {
  return (
    <header className="app-header" style={{
      height: 54, background: '#ffffff', borderBottom: '1px solid #ebe4da',
      display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12,
    }}>
      {/* Logo */}
      <div className="header-logo" style={{
        display: 'flex', alignItems: 'center', gap: 10,
        minWidth: 210, paddingRight: 16, borderRight: '1px solid #ebe4da',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 6, background: '#634B29',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Waves size={18} color="#ffffff" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{
            fontSize: 20, fontWeight: 900, color: '#1a140e',
            letterSpacing: '-0.02em', lineHeight: 1, margin: 0,
          }}>
            UrbanFlood-X
          </h1>
        </div>
      </div>

      <div className="header-center" />
      <div className="header-right" />
    </header>
  );
}
