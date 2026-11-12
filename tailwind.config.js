/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontSize: {
        'xs': ['0.875rem', { lineHeight: '1.25rem' }],       // ~14px (was 12px)
        'sm': ['0.975rem', { lineHeight: '1.4rem' }],        // ~15.6px (was 14px)
        'base': ['1.075rem', { lineHeight: '1.55rem' }],     // ~17.2px (was 16px)
        'lg': ['1.22rem', { lineHeight: '1.75rem' }],        // ~19.5px (was 18px)
        'xl': ['1.375rem', { lineHeight: '1.85rem' }],       // ~22px (was 20px)
        '2xl': ['1.65rem', { lineHeight: '2.1rem' }],        // ~26.4px (was 24px)
        '3xl': ['2rem', { lineHeight: '2.35rem' }],          // ~32px (was 30px)
        '4xl': ['2.45rem', { lineHeight: '2.75rem' }],
        '5xl': ['3.2rem', { lineHeight: '1' }],
      },
      fontWeight: {
        normal: '600',
        medium: '650',
        semibold: '750',
        bold: '850',
        extrabold: '900',
        black: '950',
      },
    },
  },
  plugins: [],
}
