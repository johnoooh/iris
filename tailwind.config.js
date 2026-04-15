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
          700: '#9a8e80',
          800: '#7c6f5e',
          900: '#5a4e40',
          950: '#3a2e22',
        },
      },
    },
  },
  plugins: [],
}
