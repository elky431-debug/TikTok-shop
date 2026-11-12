import type { Config } from 'tailwindcss';

const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  // Le noir est le thème par défaut : « dark: » s'applique partout sauf en thème clair choisi dans le compte.
  darkMode: ['variant', ':root:not([data-theme="light"]) &'],
  theme: {
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
    },
    extend: {
      colors: {
        bg: token('bg'),
        fg: token('fg'),
        surface: token('surface'),
        raised: token('raised'),
        line: 'var(--border)',
        'line-strong': 'var(--border-strong)',
        muted: token('muted'),
        subtle: token('subtle'),
        rose: {
          DEFAULT: token('rose'),
          ink: token('rose-ink'),
          fill: token('rose-fill'),
          soft: token('rose-soft'),
        },
        cyan: {
          DEFAULT: token('cyan'),
          ink: token('cyan-ink'),
          soft: token('cyan-soft'),
        },
        gain: {
          DEFAULT: token('gain'),
          soft: token('gain-soft'),
        },
        warn: {
          DEFAULT: token('warn'),
          soft: token('warn-soft'),
        },
        ink: '#161823',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      maxWidth: {
        prose: '68ch',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        pop: {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.06)' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 420ms cubic-bezier(.2,.7,.2,1) both',
        shimmer: 'shimmer 1.4s infinite',
        pop: 'pop 260ms ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
