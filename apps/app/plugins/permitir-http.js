/**
 * Solo para compilaciones de prueba (CI con API local por http).
 * Con FG_ALLOW_HTTP=1 en el prebuild, Android permite tráfico http sin cifrar.
 * Nunca activarlo en compilaciones para tiendas: la API real va por https.
 */
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function permitirHttp(config) {
  if (process.env.FG_ALLOW_HTTP !== '1') return config;
  return withAndroidManifest(config, (c) => {
    const app = c.modResults.manifest.application?.[0];
    if (app) app.$['android:usesCleartextTraffic'] = 'true';
    return c;
  });
};
