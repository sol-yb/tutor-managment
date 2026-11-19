/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        forest: {
          950: '#062e24',
          900: '#0a3d2e',
          800: '#11543f',
          700: '#167052',
          600: '#1e8661',
          100: '#dff4e9',
          50: '#effaf4'
        },
        gold: '#d8a441'
      },
      boxShadow: {
        card: '0 12px 35px rgba(6, 46, 36, 0.08)'
      }
    }
  },
  plugins: [],
};
