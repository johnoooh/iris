/** @type {import('tailwindcss').Config} */
// Color, type, shadow, and radius tokens are sourced from styles/tokens.css
// (CSS custom properties). Tailwind utilities and inline `var(--…)` references
// stay in sync because they read from the same root variables.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        parchment: {
          50:  'var(--p-50)',
          100: 'var(--p-100)',
          200: 'var(--p-200)',
          300: 'var(--p-300)',
          400: 'var(--p-400)',
          500: 'var(--p-500)',
          700: 'var(--p-700)',
          800: 'var(--p-800)',
          900: 'var(--p-900)',
          950: 'var(--p-950)',
        },
        iris: {
          50:  'var(--iris-50)',
          100: 'var(--iris-100)',
          300: 'var(--iris-300)',
          500: 'var(--iris-500)',
          600: 'var(--iris-600)',
          700: 'var(--iris-700)',
          900: 'var(--iris-900)',
        },
        signal: {
          good:      'var(--signal-good)',
          'good-bg': 'var(--signal-good-bg)',
          warn:      'var(--signal-warn)',
          'warn-bg': 'var(--signal-warn-bg)',
          bad:       'var(--signal-bad)',
          'bad-bg':  'var(--signal-bad-bg)',
        },
      },
      fontFamily: {
        serif: 'var(--serif)',
        sans:  'var(--sans)',
        mono:  'var(--mono)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
    },
  },
  plugins: [],
}
