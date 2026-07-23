/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./src/renderer/src/**/*.{js,jsx,ts,tsx,html}', './src/renderer/index.html'],
  safelist: [
    'event-bar--single',
    'event-bar--start',
    'event-bar--middle',
    'event-bar--end',
    'event-bar--continuation'
  ],
  theme: {
    extend: {
      colors: {
        gcal: {
          page: 'var(--gcal-page)',
          'page-alt': 'var(--gcal-page-alt)',
          blue: 'var(--gcal-blue, #1a73e8)',
          'blue-dark': 'var(--gcal-blue-dark)',
          'blue-soft': 'var(--gcal-blue-soft)',
          red: '#d50000',
          'red-soft': 'var(--gcal-red-soft)',
          green: '#137333',
          'green-soft': 'var(--gcal-green-soft)',
          'yellow-soft': 'var(--gcal-yellow-soft)',
          saturday: '#039be5',
          sunday: '#d50000',
          border: 'var(--gcal-border)',
          'border-light': 'var(--gcal-border-light)',
          'grid-line': 'var(--gcal-grid-line)',
          muted: 'var(--gcal-muted)',
          body: 'var(--gcal-body)',
          heading: 'var(--gcal-heading)',
          surface: 'var(--gcal-surface)',
          'surface-2': 'var(--gcal-surface-2)',
          input: 'var(--gcal-input-bg)'
        }
      },
      fontFamily: {
        sans: [
          '"Segoe UI"',
          '"Malgun Gothic"',
          '"Apple SD Gothic Neo"',
          '"Noto Sans KR"',
          'sans-serif'
        ]
      },
      boxShadow: {
        'g-sm': '0 1px 2px rgba(60, 64, 67, 0.15), 0 1px 3px rgba(60, 64, 67, 0.1)',
        'g-md': '0 4px 16px rgba(60, 64, 67, 0.18)',
        'g-lg': '0 8px 28px rgba(60, 64, 67, 0.22)'
      }
    }
  },
  plugins: []
}
