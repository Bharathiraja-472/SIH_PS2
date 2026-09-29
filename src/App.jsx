import { useState } from 'react';
import { SimulationProvider } from './context/SimulationContext.jsx';
import Header from './components/Layout/Header.jsx';
import Sidebar from './components/Layout/Sidebar.jsx';
import HomePage from './pages/HomePage.jsx';
import ScenarioPage from './pages/ScenarioPage.jsx';
import SimulationPage from './pages/SimulationPage.jsx';
import FloodMapPage from './pages/FloodMapPage.jsx';
import FloodImpactPage from './pages/FloodImpactPage.jsx';
import DrainageAnalysisPage from './pages/DrainageAnalysisPage.jsx';
import HazardAlertsPage from './pages/HazardAlertsPage.jsx';
import SafeRoutingPage from './pages/SafeRoutingPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';

// ── Simple client-side router ────────────────────────────────
const ROUTES = {
  '/':             { component: HomePage,             title: 'Dashboard' },
  '/scenario':     { component: ScenarioPage,         title: 'Nowcast Scenario' },
  '/simulation':   { component: SimulationPage,       title: 'Simulation' },
  '/flood-map':    { component: FloodMapPage,         title: 'Flood Map' },
  '/flood-impact': { component: FloodImpactPage,      title: 'Flood Impact' },
  '/drainage':     { component: DrainageAnalysisPage, title: 'Drainage Analysis' },
  '/alerts':       { component: HazardAlertsPage,     title: 'Hazard Alerts' },
  '/routing':      { component: SafeRoutingPage,      title: 'Safe Routing' },
  '/reports':      { component: ReportsPage,          title: 'Reports' },
};

function Router({ currentPath, onNavigate }) {
  const route = ROUTES[currentPath] ?? ROUTES['/'];
  const PageComponent = route.component;
  return <PageComponent title={route.title} onNavigate={onNavigate} />;
}

export default function App() {
  const [currentPath, setCurrentPath] = useState('/');

  return (
    <SimulationProvider>
      <div className="app-shell">
        <Header />
        <div className="app-body">
          <Sidebar currentPath={currentPath} onNavigate={setCurrentPath} />
          <Router currentPath={currentPath} onNavigate={setCurrentPath} />
        </div>
      </div>
    </SimulationProvider>
  );
}
