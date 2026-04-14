import forms from '@tailwindcss/forms'

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#2563eb',
          dark: '#1d4ed8',
          light: 'rgba(37,99,235,0.12)'
        },
        surface: { DEFAULT: '#ffffff', 2: '#f8fafc' },
        border: '#e2e8f0',
        muted: '#64748b',
        success: '#16a34a',
        danger: '#ef4444',
        slate: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a'
        }
      },
      fontFamily: {
        sans: ['Inter', 'Sora', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      borderRadius: {
        DEFAULT: '10px',
        lg: '14px',
        xl: '1rem',
        '2xl': '1.5rem',
        '3xl': '2rem'
      },
      boxShadow: {
        card: '0 12px 30px rgba(15, 23, 42, 0.08)',
        sm: '0 1px 3px rgba(15, 23, 42, 0.06)'
      }
    }
  },
  plugins: [forms]
}
