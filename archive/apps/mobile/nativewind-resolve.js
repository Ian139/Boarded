const path = require('path');
const Module = require('module');

const mobileNodeModules = path.resolve(__dirname, 'node_modules');
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function (request, parent, isMain, options) {
  if (process.env.NATIVEWIND_DEBUG_RESOLVE) {
    if (request.startsWith('tailwindcss')) {
      console.log('[nativewind-resolve]', request);
    }
  }
  if (request === 'tailwindcss' || request.startsWith('tailwindcss/')) {
    return originalResolveFilename.call(this, request, parent, isMain, {
      ...options,
      paths: [mobileNodeModules],
    });
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
