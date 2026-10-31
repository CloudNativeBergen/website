'use client'

import '@/styles/tailwind.css'
import { RouteError } from '@/components/errors/RouteError'

/** Last resort for errors thrown in the root layout itself (#825). */
export default function GlobalError(props: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body className="bg-white dark:bg-gray-950">
        <RouteError {...props} />
      </body>
    </html>
  )
}
