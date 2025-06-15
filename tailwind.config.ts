import headlessuiPlugin from '@headlessui/tailwindcss'
import formsPlugin from '@tailwindcss/forms'
import containerQueriesPlugin from '@tailwindcss/container-queries'

export default {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  plugins: [headlessuiPlugin, formsPlugin, containerQueriesPlugin],
  theme: {
    extend: {
      animation: {
        'pulse-subtle': 'pulse-subtle 4s ease-in-out infinite',
      },
      keyframes: {
        'pulse-subtle': {
          '0%, 100%': {
            transform: 'scale(1.05)',
            boxShadow:
              '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 4px rgba(59, 130, 246, 0.15)',
          },
          '50%': {
            transform: 'scale(1.06)',
            boxShadow:
              '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 6px rgba(59, 130, 246, 0.2)',
          },
        },
      },
    },
  },
}
