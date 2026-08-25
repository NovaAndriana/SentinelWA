import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        void: {
          DEFAULT: '#0a0a0f',
          900: '#07070b',
          800: '#0a0a0f',
          700: '#0d1117',
          600: '#11161f',
          500: '#161c26',
        },
        grid: {
          line: 'rgba(0, 255, 157, 0.06)',
          strong: 'rgba(0, 229, 255, 0.14)',
        },
        neon: {
          DEFAULT: '#00ff9d',
          emerald: '#00ff9d',
          cyan: '#00e5ff',
          dim: '#0f8f66',
          violet: '#a06bff',
        },
        warn: '#ffb020',
        crit: '#ff3b5c',
        muted: {
          DEFAULT: '#6b7f95',
          foreground: '#8ba0b6',
        },
        edge: 'rgba(0, 229, 255, 0.16)',
      },
      fontFamily: {
        mono: [
          'var(--font-mono)',
          'JetBrains Mono',
          'Fira Code',
          'IBM Plex Mono',
          'SFMono-Regular',
          'Consolas',
          'monospace',
        ],
        sans: ['var(--font-mono)', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        neon: '0 0 0 1px rgba(0,255,157,0.25), 0 0 18px -4px rgba(0,255,157,0.35)',
        cyan: '0 0 0 1px rgba(0,229,255,0.25), 0 0 18px -4px rgba(0,229,255,0.35)',
        crit: '0 0 0 1px rgba(255,59,92,0.3), 0 0 18px -4px rgba(255,59,92,0.45)',
        panel: 'inset 0 1px 0 0 rgba(255,255,255,0.03)',
      },
      backgroundImage: {
        scanlines:
          'repeating-linear-gradient(to bottom, rgba(0,255,157,0.035) 0px, rgba(0,255,157,0.035) 1px, transparent 1px, transparent 3px)',
        gridfade:
          'linear-gradient(rgba(0,229,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,0.05) 1px, transparent 1px)',
      },
      backgroundSize: {
        grid: '32px 32px',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: '1', filter: 'drop-shadow(0 0 2px currentColor)' },
          '50%': { opacity: '0.55', filter: 'drop-shadow(0 0 6px currentColor)' },
        },
        sweep: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(400%)' },
        },
        flicker: {
          '0%, 19%, 21%, 23%, 25%, 54%, 56%, 100%': { opacity: '1' },
          '20%, 24%, 55%': { opacity: '0.72' },
        },
        blink: {
          '0%, 49%': { opacity: '1' },
          '50%, 100%': { opacity: '0' },
        },
      },
      animation: {
        'pulse-glow': 'pulseGlow 2.4s ease-in-out infinite',
        sweep: 'sweep 6s linear infinite',
        flicker: 'flicker 6s linear infinite',
        blink: 'blink 1.1s step-end infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
