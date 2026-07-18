/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Web app's warm earthy palette (converted from OKLch)
        background: '#f5f1e8',
        foreground: '#3d2817',
        card: '#fffbf7',
        'card-foreground': '#3d2817',
        primary: '#8b6f47',
        'primary-foreground': '#fffbf7',
        secondary: '#4a7c59',
        'secondary-foreground': '#fffbf7',
        accent: '#6ba860',
        'accent-foreground': '#fffbf7',
        muted: '#f0e8df',
        'muted-foreground': '#8b7668',
        border: '#e6ddd0',
        input: '#ede5d8',
        destructive: '#dc2626',
        hold: {
          start: '#10b981',
          hand: '#ef4444',
          foot: '#3b82f6',
          finish: '#f59e0b',
        },
      },
      borderRadius: {
        sm: 12,
        md: 14,
        lg: 16,
        xl: 20,
        '2xl': 24,
        '3xl': 28,
        '4xl': 32,
      },
    },
  },
  plugins: [],
};
