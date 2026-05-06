/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        parchment: {
          50:  '#faf7f2',
          100: '#f7f4ef',
          200: '#f0ebe2',
          300: '#e8ddd0',
          400: '#e0d5c5',
          500: '#d4c9b8',
          600: '#c5b8a8',
          700: '#8a7d6f',
          // Darkened from #7c6f5e — the previous value gave 4.12–4.45:1 on
          // parchment-100/200 backgrounds (Lighthouse a11y violation, just
          // below 4.5:1 WCAG AA for small text). #635544 yields ~6:1.
          800: '#635544',
          900: '#4a3f33',
          950: '#3a2e22',
        },
      },
    },
  },
  plugins: [],
}
