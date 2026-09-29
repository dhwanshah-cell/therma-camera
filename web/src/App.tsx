import { useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { startApp, stopApp } from './app/bootstrap';
import { DashboardPage } from './pages/Dashboard';
import { LivePage } from './pages/Live';
import { ThermalPage } from './pages/Thermal';
import { SensorsPage } from './pages/Sensors';
import { AlertsPage } from './pages/Alerts';
import { MapPage } from './pages/Map';
import { Map3DPage } from './pages/Map3D';
import { StoragePage } from './pages/Storage';
import { MissionsPage } from './pages/Missions';
import { RobotPage } from './pages/Robot';
import { SettingsPage } from './pages/Settings';

export function App() {
  useEffect(() => {
    startApp();
    return () => stopApp();
  }, []);
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/live" element={<LivePage />} />
          <Route path="/thermal" element={<ThermalPage />} />
          <Route path="/sensors" element={<SensorsPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/map3d" element={<Map3DPage />} />
          <Route path="/storage" element={<StoragePage />} />
          <Route path="/missions" element={<MissionsPage />} />
          <Route path="/missions/:id" element={<MissionsPage />} />
          <Route path="/robot" element={<RobotPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<DashboardPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
