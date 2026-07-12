const existingJourneyLinesConfig = window.JOURNEYLINES_CONFIG || {};
const existingValhallaConfig = existingJourneyLinesConfig.valhalla || {};

window.JOURNEYLINES_CONFIG = {
  mapboxToken: '',
  ...existingJourneyLinesConfig,
  valhalla: {
    enabled: true,
    endpoints: [
      'https://valhalla1.openstreetmap.de',
      'https://valhalla.openstreetmap.de'
    ],
    timeoutMs: 18000,
    clientId: 'GlobeHoppers',
    sendClientHeader: false,
    ...existingValhallaConfig
  }
};
