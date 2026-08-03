import * as React from 'react'

import {
  DEFAULT_EMAIL_BRAND_PALETTE,
  resolveEmailBrandPalette,
  type EmailBrandPalette,
} from '@/lib/branding/email'

/**
 * INHERIT ONCE.
 *
 * Before this existed, every email primitive took its colour from a hard-coded
 * default and no call site ever overrode it, so every CTA in every email went
 * out in the house blue regardless of the tenant. Threading a `color` prop
 * through ~11 templates to ~11 button call sites would have been the same bug
 * waiting to be reintroduced by the next template.
 *
 * Instead `BaseEmailTemplate` — which every React email already wraps itself in
 * — publishes the resolved palette here, and the primitives read it. A new
 * template gets tenant colours by doing nothing.
 *
 * The default is the HOUSE palette, so a primitive rendered outside any
 * `BaseEmailTemplate` (Storybook, the admin preview panes) keeps its previous
 * appearance instead of throwing or rendering colourless.
 */
const EmailBrandContext = React.createContext<EmailBrandPalette>(
  DEFAULT_EMAIL_BRAND_PALETTE,
)

/** The palette for the email currently being rendered. */
export function useEmailBrand(): EmailBrandPalette {
  return React.useContext(EmailBrandContext)
}

export function EmailBrandProvider({
  brandColor,
  children,
}: {
  brandColor?: string
  children: React.ReactNode
}) {
  // Resolution is memoised in `resolveEmailBrandPalette` and returns a stable
  // object per hex, so the provider value is referentially stable without a
  // hook — which matters because these trees are also rendered by
  // `renderToStaticMarkup` outside React's usual lifecycle.
  return (
    <EmailBrandContext.Provider value={resolveEmailBrandPalette(brandColor)}>
      {children}
    </EmailBrandContext.Provider>
  )
}
