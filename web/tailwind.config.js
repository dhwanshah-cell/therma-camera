/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0b0f14',
        panel: '#121821',
        panel2: '#0f141c',
        line: '#1f2a37',
        thermal: '#ff7a1a',
        ok: '#22c55e',
        bad: '#ef4444',
        sim: '#f59e0b',
        muted: '#8a97a8',
        text: '#e6edf3',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
