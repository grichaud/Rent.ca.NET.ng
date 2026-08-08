/** @type {import('tailwindcss').Config} */
// Portado de ..\Rent.ca.NET\src\Rent.Web\tailwind.config.js sin cambios de diseno.
// Lo unico que cambia es `content`: alli apuntaba a .cshtml, aqui a los templates
// y componentes de Angular.
module.exports = {
  darkMode: 'class',
  content: [
    './src/**/*.{html,ts}'
  ],
  // Paridad Next.js (city-card CITY_GRADIENTS): los gradientes por slug se interpolan
  // en runtime, asi que Tailwind no los detecta en build-time. Safelist explicito para
  // asegurar que se incluyan en el CSS final.
  safelist: [
    { pattern: /^(from|via|to)-(brand|cyan|purple|amber|green|indigo|teal|orange|slate)-(800|900|950)$/ },
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eef7ff',
          100: '#d9edff',
          200: '#bce0ff',
          300: '#8ecdff',
          400: '#59b0ff',
          500: '#338dff',
          600: '#1a6df5',
          700: '#1457e1',
          800: '#1747b6',
          900: '#193f8f',
          950: '#142857'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      animation: {
        'float-bg': 'floatBG 15s ease-in-out infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        shimmer: 'shimmer 2s linear infinite',
        glow: 'glow 2s ease-in-out infinite alternate'
      },
      keyframes: {
        floatBG: {
          '0%, 100%': { backgroundPosition: 'center center' },
          '50%':      { backgroundPosition: '70% 30%' }
        },
        shimmer: {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' }
        },
        glow: {
          '0%':   { boxShadow: '0 0 20px rgba(51, 141, 255, 0.3)' },
          '100%': { boxShadow: '0 0 40px rgba(51, 141, 255, 0.6)' }
        }
      },
      backdropBlur: {
        xs: '2px'
      }
    }
  },
  plugins: []
};
