import clsx from 'clsx'
import { Button } from '@/components/Button'

/**
 * "Sign Out" for the workshop portal (#1296): a form that POSTS to the sign-out
 * server action, which ends the WorkOS session through the SDK.
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
      <Button
        type="submit"
        variant="outline"
        className={clsx('whitespace-nowrap', className)}
      >
        Sign Out
      </Button>
    </form>
  )
}
