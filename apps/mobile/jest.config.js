module.exports = {
  preset: 'jest-expo',
  moduleDirectories: ['node_modules', '<rootDir>/node_modules', '<rootDir>/../../node_modules'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native|@react-navigation|expo(nent)?|expo-modules-core|@expo(nent)?|@unimodules|unimodules|sentry-expo|nativewind|nanoid)/)',
  ],
};
