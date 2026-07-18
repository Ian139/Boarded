module.exports = function (api) {
  api.cache(true);
  const expoRouterBabelPlugin = require('babel-preset-expo/build/expo-router-plugin').expoRouterBabelPlugin;
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      require('nativewind/babel'),
    ],
    plugins: [
      // Explicitly add the expo-router babel plugin — in this monorepo,
      // babel-preset-expo is hoisted to root node_modules and its
      // hasModule('expo-router') check fails because expo-router lives
      // in apps/mobile/node_modules. Adding it here bypasses that check.
      expoRouterBabelPlugin,
      'react-native-reanimated/plugin',
    ],
  };
};
