export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#0a0a0f',
        node: 'rgba(255,255,255,0.04)',
        nodeborder: 'rgba(255,255,255,0.08)',
        accent: '#6e8efb',
        accentsoft: 'rgba(110,142,251,0.12)',
        success: '#34d399',
        warn: '#fbbf24',
        danger: '#f87171',
        glass: 'rgba(255,255,255,0.03)',
        glassborder: 'rgba(255,255,255,0.06)',
      },
      backdropBlur: {
        glass: '24px',
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '20px',
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
        glow: '0 0 20px rgba(110,142,251,0.15)',
        soft: '0 4px 24px rgba(0,0,0,0.2)',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    }
  },
  plugins: []
}
