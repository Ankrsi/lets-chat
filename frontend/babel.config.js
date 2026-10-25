module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    env: {
      // Release builds: drop log/info/debug calls (they cost time on hot paths and can leak data).
      // warn/error stay for crash reports.
      production: {
        plugins: [["transform-remove-console", { exclude: ["error", "warn"] }]],
      },
    },
  };
};
