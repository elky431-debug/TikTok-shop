import type { Config } from 'tailwindcss';

const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  // Le blanc est le thème par défaut : « dark: » ne s'applique qu'au thème noir choisi dans le compte.
  darkMode: ['variant', ':root[data-theme="dark"] &'],
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
        'on-primary': token('on-primary'),
        'on-gradient': token('on-gradient'),
        positive: token('positive'),
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
        skeleton: {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '1' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'grow-x': {
          from: { transform: 'scaleX(0)' },
          to: { transform: 'scaleX(1)' },
        },
        pop: {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.06)' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 420ms cubic-bezier(.2,.7,.2,1) backwards',
        shimmer: 'shimmer 1.4s infinite',
        skeleton: 'skeleton 1.5s ease-in-out infinite',
        pop: 'pop 260ms ease-out',
        'grow-x': 'grow-x 600ms cubic-bezier(.2,.7,.2,1) both',
      },
    },
  },
  plugins: [],
};

export default config;
