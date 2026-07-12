const fs = require('fs');
const path = require('path');

// Force NativeWind to resolve Tailwind v3 from apps/mobile
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
const mobileNodeModules = path.resolve(__dirname, 'node_modules');

// Ensure child processes (NativeWind CLI) resolve mobile deps
process.env.NODE_PATH = mobileNodeModules + (process.env.NODE_PATH ? `:${process.env.NODE_PATH}` : '');
Module._initPaths();
const resolvePatchPath = path.resolve(__dirname, 'nativewind-resolve.js');
if (!process.env.NODE_OPTIONS || !process.env.NODE_OPTIONS.includes(resolvePatchPath)) {
  const existing = process.env.NODE_OPTIONS ? `${process.env.NODE_OPTIONS} ` : '';
  process.env.NODE_OPTIONS = `${existing}--require ${resolvePatchPath}`.trim();
}

Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'tailwindcss' || request.startsWith('tailwindcss/')) {
    return originalResolveFilename.call(this, request, parent, isMain, {
      ...options,
      paths: [mobileNodeModules],
    });
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

const resolveFromProject = (name) => {
  const localPath = path.resolve(projectRoot, 'node_modules', name);
  if (fs.existsSync(localPath)) return localPath;
  return path.resolve(monorepoRoot, 'node_modules', name);
};

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  react: resolveFromProject('react'),
  tailwindcss: resolveFromProject('tailwindcss'),
  postcss: resolveFromProject('postcss'),
};

const escRoot = monorepoRoot.replace(/[/\\]/g, '[/\\\\]');
config.resolver.blockList = [
  /\.next\/.*/,
  /\.git\/.*/,
  new RegExp(`${escRoot}[/\\\\]node_modules[/\\\\]react[/\\\\](?!native)`),
  new RegExp(`${escRoot}[/\\\\]node_modules[/\\\\]tailwindcss[/\\\\]`),
];

// Disable watchman — can cause hangs in monorepos
config.resolver.useWatchman = false;

module.exports = withNativeWind(config, {
  input: './global.css',
  configPath: './tailwind.config.js',
});
