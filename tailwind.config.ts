import headlessuiPlugin from '@headlessui/tailwindcss'
import formsPlugin from '@tailwindcss/forms'

export default {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  plugins: [headlessuiPlugin, formsPlugin],
}
