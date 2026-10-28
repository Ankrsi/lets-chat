const { withAndroidManifest } = require('@expo/config-plugins');

// A library (TAndroidLame) sets allowBackup="true", which clashes with our "false".
// tools:replace tells the manifest merger to keep our value.
module.exports = function withAllowBackupFix(config) {
  return withAndroidManifest(config, async config => {
    const manifest = config.modResults.manifest;
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    const app = manifest.application[0];
    const replace = (app.$['tools:replace'] || '').split(',').filter(Boolean);
    if (!replace.includes('android:allowBackup')) replace.push('android:allowBackup');
    app.$['tools:replace'] = replace.join(',');

    return config;
  });
};
