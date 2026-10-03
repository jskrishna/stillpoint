// Expo's preset is the whole of it. Reanimated's plugin is deliberately absent:
// this app does not use Reanimated, and the plugin has to be last if it is ever
// added.
module.exports = function babel(api) {
  api.cache(true);
  return { presets: [['babel-preset-expo', { jsxImportSource: 'react' }]] };
};
