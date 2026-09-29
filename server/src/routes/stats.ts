import type { FastifyPluginAsync } from 'fastify';

/** GET /api/stats: dashboard counters. */
export const statsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/stats', async () => {
    const { repos } = app;
    const active = repos.missions.activeMission();
    const latestSensor = repos.sensors.latest();
    return {
      simulation: app.config.simulation,
      phoneConnected: app.hub.phoneConnected,
      lastPhoneSeen: app.hub.lastPhoneSeen,
      webClients: app.hub.webClientCount,
      activeMission: active,
      missions: repos.missions.count(),
      sensorReadings: repos.sensors.count(),
      lastSensorAt: latestSensor?.timestamp ?? null,
      alerts: repos.alerts.count(),
      unacknowledgedAlerts: repos.alerts.count({ acknowledged: false }),
      thermalImages: repos.thermalImages.count(),
      rgbImages: repos.rgbImages.count(),
      thermalVideos: repos.videos.count('THERMAL'),
      rgbVideos: repos.videos.count('RGB'),
      maps: repos.maps.count(),
      imuSamples: repos.imu.count(),
      syncedEnvelopes: repos.syncLog.count(),
      liveThermalFrame: app.hub.latestFrame('thermal'),
      liveRgbFrame: app.hub.latestFrame('rgb'),
    };
  });
};
