/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#4F7A45',
        deep: '#2F5D35',
        sage: '#DDE9D8',
        cream: '#FAF8F1',
        yellow: '#F2C14E',
        sky: '#6FAEE8',
        apricot: '#F3A76F',
        ink: '#223024',
        muted: '#5E6A60',
      },
      boxShadow: {
        soft: '0 18px 45px rgba(47, 93, 53, 0.10)',
        phone: '0 28px 70px rgba(34, 48, 36, 0.24)',
      },
    },
  },
  plugins: [],
};
