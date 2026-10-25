const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withCallKeepService(config) {
  return withAndroidManifest(config, async config => {
    const manifest = config.modResults;

    const app = manifest.manifest.application[0];

    app.service = app.service || [];

    app.service.push({
      $: {
        'android:name': 'io.wazo.callkeep.VoiceConnectionService',
        'android:permission': 'android.permission.BIND_TELECOM_CONNECTION_SERVICE',
        'android:exported': 'true'
      },
      'intent-filter': [
        {
          action: [
            {
              $: { 'android:name': 'android.telecom.ConnectionService' }
            }
          ]
        }
      ]
    });

    return config;
  });
};
