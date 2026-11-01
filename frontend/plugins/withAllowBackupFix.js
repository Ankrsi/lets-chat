const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// A library (TAndroidLame) sets allowBackup="true", which clashes with our "false".
// tools:replace tells the manifest merger to keep our value.
const addReplace = (current) => {
  const list = (current || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!list.includes('android:allowBackup')) list.push('android:allowBackup');
  return list.join(',');
};

module.exports = function withAllowBackupFix(config) {
  // Main manifest
  config = withAndroidManifest(config, async config => {
    const manifest = config.modResults.manifest;
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    const app = manifest.application[0];
    app.$['tools:replace'] = addReplace(app.$['tools:replace']);
    return config;
  });

  // Debug manifest: it has its own tools:replace (for usesCleartextTraffic), which wins in debug builds
  return withDangerousMod(config, ['android', async config => {
    const file = path.join(config.modRequest.platformProjectRoot, 'app/src/debug/AndroidManifest.xml');
    if (fs.existsSync(file)) {
      let xml = fs.readFileSync(file, 'utf8').replace(/tools:replace="([^"]*)"/, (m, v) => `tools:replace="${addReplace(v)}"`);
      // tools:replace needs the value to keep, so it's repeated here
      if (!xml.includes('android:allowBackup=')) xml = xml.replace('<application ', '<application android:allowBackup="false" ');
      fs.writeFileSync(file, xml);
    }
    return config;
  }]);
};
