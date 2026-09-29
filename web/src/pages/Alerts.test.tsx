import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { Alert, ThermalImage } from '@robodog/shared';

const simulatedAlert: Alert = {
  id: 'a1',
  type: 'THERMAL_INTENSITY_HOTSPOT',
  severity: 'WARNING',
  timestamp: '2026-09-29T12:00:00.000Z',
  message: 'Bright thermal region detected',
  metadata: { gasRaw: 512, humidityPct: 41 },
  missionId: null,
  position: null,
  source: 'SIMULATION',
  thermalImageId: 't1',
  rgbImageId: null,
  acknowledged: false,
};

const nonRadiometricImage: ThermalImage = {
  id: 't1',
  timestamp: '2026-09-29T12:00:00.000Z',
  missionId: null,
  cameraModel: 'Fluke iSee TC01A',
  width: 256,
  height: 192,
  fileName: 'thermal_1.jpg',
  filePath: '/media/RoboDog/Thermal/Images/thermal_1.jpg',
  palette: 'IRON',
  frameFormat: 'MJPEG',
  radiometric: false,
  centerTemperature: null,
  minTemperature: null,
  maxTemperature: null,
  emissivity: null,
  distance: null,
  x: null,
  y: null,
  z: null,
  positionFrame: null,
  source: 'SIMULATION',
  sizeBytes: 1234,
  uploaded: true,
};

vi.mock('../api/client', () => ({
  api: {
    alerts: vi.fn(async () => [simulatedAlert]),
    thermalImage: vi.fn(async () => nonRadiometricImage),
    rgbImages: vi.fn(async () => []),
    acknowledgeAlert: vi.fn(async () => ({ ...simulatedAlert, acknowledged: true })),
  },
}));

import { AlertsPage } from './Alerts';
import { useAlertsStore } from '../store/alerts';
import { useMediaStore } from '../store/media';

describe('AlertsPage', () => {
  beforeEach(() => {
    useAlertsStore.setState({ alerts: [], loaded: false });
    useMediaStore.setState({ thermalById: {}, rgbImages: [] });
  });

  it('shows a SIMULATION badge for a simulated alert and no temperature for a non-radiometric image', async () => {
    render(<AlertsPage />);
    await waitFor(() => expect(screen.getByText('Bright thermal region detected')).toBeInTheDocument());

    const badges = await screen.findAllByTestId('simulation-badge');
    expect(badges.length).toBeGreaterThan(0);
    expect(badges[0]).toHaveTextContent(/simulation mode/i);

    await waitFor(() => expect(screen.getByText('Radiometric temperature unavailable')).toBeInTheDocument());
    expect(screen.getByText('Thermal image available')).toBeInTheDocument();
    expect(screen.queryByText(/°C/)).toBeNull();

    // sensor values from metadata are shown, gas raw is never labelled ppm
    expect(screen.getByText('512')).toBeInTheDocument();
    expect(document.body.textContent?.toLowerCase()).not.toContain('ppm');
  });
});
