'use client'

import type { ComponentProps } from 'react'

/**
 * A form whose server action returns the path to go to next, followed with a
 * FULL page load instead of `redirect()`.
 *
 * Why not `redirect()`: from a fetch action, Next answers a same-origin
 * redirect by fetching the target's RSC payload from its own public origin and
 * streaming it back in the action response. On Vercel that self-fetch of a
 * partially prerendered page hung until the 300 s function timeout after the
 * sign-in actions (production logs: every `/signin/verify-request` and `/` 504
 * followed a `POST /signin` or `POST /signin/confirm`). A full load is also
 * what a sign-in wants anyway: the new cookie reaches every server component.
 */
export function FullPageActionForm({
  action,
  ...props
}: Omit<ComponentProps<'form'>, 'action'> & {
  action: (formData: FormData) => Promise<string>
}) {
  return (
    <form
      {...props}
      action={async (formData) => {
        window.location.assign(await action(formData))
      }}
    />
  )
}
