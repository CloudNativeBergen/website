import { redirect } from 'next/navigation'
import { APPEARANCE_SECTION } from '@/lib/settings/appearance'

/** Legacy sub-page → the Homepage section of the one Appearance page. */
export default function AppearanceHomepageRedirect(): never {
  redirect(APPEARANCE_SECTION.homepage.href)
}
