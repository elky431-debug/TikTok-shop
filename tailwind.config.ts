import type { Config } from 'tailwindcss';

const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  darkMode: ['variant', ['@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) & }', ':root[data-theme="dark"] &']],
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
        line: token('line'),
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
      fontSize: {
        // Échelle typographique (ratio ~1.25), interlignage serré pour les titres
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.875rem', { lineHeight: '1.3rem' }],
        base: ['1rem', { lineHeight: '1.55rem' }],
        lg: ['1.125rem', { lineHeight: '1.65rem' }],
        xl: ['1.375rem', { lineHeight: '1.8rem' }],
        '2xl': ['1.75rem', { lineHeight: '2.1rem', letterSpacing: '-0.01em' }],
        '3xl': ['2.25rem', { lineHeight: '2.5rem', letterSpacing: '-0.02em' }],
        '4xl': ['2.875rem', { lineHeight: '3rem', letterSpacing: '-0.025em' }],
        '5xl': ['3.75rem', { lineHeight: '3.8rem', letterSpacing: '-0.03em' }],
      },
      maxWidth: {
        prose: '68ch',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
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
