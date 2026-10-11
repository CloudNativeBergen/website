'use client'

import clsx from 'clsx'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/Button'

/**
 * "Sign Out" for the workshop portal (#1296, #1315): a form that POSTS to the
 * sign-out server action, which ends the portal's session on this host and
 * sends the browser on to end the WorkOS login.
 *
 * A form and not a link on purpose. A GET sign-out can be triggered by a
 * prefetch or by any page that embeds the URL; a server action is a POST that
 * Next checks the origin of.
 *
 * `action` is a prop so the component renders in Storybook without the server
 * action's server-only imports; the page passes `signOutOfWorkshop`.
 */
export function WorkshopSignOutButton({
  action,
  className,
}: {
  action: () => Promise<void>
  className?: string
}) {
  return (
    <form action={action} className="shrink-0">
      <SubmitButton className={className} />
    </form>
  )
}

/**
 * Disabled while the action runs: a second press would find the session
 * already gone and send the browser to the front page, past the step that
 * ends the WorkOS login.
 */
function SubmitButton({ className }: { className?: string }) {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      variant="outline"
      disabled={pending}
      className={clsx('whitespace-nowrap', className)}
    >
      Sign Out
    </Button>
  )
}
