/**
 * The /privacy note that the workshop login is not this event's alone (#1299).
 *
 * Attendees sign in to the workshop portal through ONE WorkOS environment
 * shared by every tenant (#1293), so the account, and the WorkOS User ID stored
 * with a registration, is the same on every conference of the platform. Render
 * it only where WorkOS is disclosed for the tenant.
 */
export function SharedWorkshopLoginNotice() {
  return (
    <div className="mt-4 rounded-lg bg-amber-100 p-3 dark:bg-amber-800/30">
      <p className="text-sm text-amber-800 dark:text-amber-200">
        <strong>One login for every conference on this platform.</strong>{' '}
        Workshop sign-in is provided by WorkOS, and your login there is a single
        account shared by all conferences hosted on this platform. It is not
        created separately for this event. If you sign in to the workshop portal
        of another conference hosted here, the login you already have is
        recognised, and the same WorkOS User ID is stored with your
        registrations there. Organizers see only the workshop registrations for
        their own organization&apos;s conferences.
      </p>
    </div>
  )
}
