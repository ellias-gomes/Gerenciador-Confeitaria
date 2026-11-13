/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#fffaf6',
        cocoa: '#4a2511',
        berry: {
          50: '#fff1f2',
          100: '#ffe4e6',
          600: '#be123c',
          700: '#9f1239',
          800: '#881337',
        },
      },
    },
  },
  plugins: [],
};
