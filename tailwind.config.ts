// Tailwind CSS v4 uses CSS-first configuration
// Configuration is now done in src/styles/tailwind.css using @theme and @source directives
// This file is kept for plugin compatibility only

import headlessuiPlugin from '@headlessui/tailwindcss'
import formsPlugin from '@tailwindcss/forms'

export default {
  plugins: [headlessuiPlugin, formsPlugin],
}
