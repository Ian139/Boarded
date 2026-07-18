const path = require('path');

// Explicitly resolve tailwindcss v3 from mobile's node_modules
// to prevent PostCSS from picking up root's tailwindcss v4
const localTailwind = path.resolve(__dirname, 'node_modules', 'tailwindcss');

module.exports = {
  plugins: {
    [localTailwind]: {},
    autoprefixer: {},
  },
};
