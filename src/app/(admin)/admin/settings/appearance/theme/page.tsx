import { redirect } from 'next/navigation'
import { APPEARANCE_SECTION } from '@/lib/settings/appearance'

/**
 * Legacy sub-page → the Theme section of the one Appearance page. The sub-pages
 * were merged away (their bodies duplicated the hub's cards); the URLs stay
 * alive because they are bookmarked and linked from older notes.
 */
export default function AppearanceThemeRedirect(): never {
  redirect(APPEARANCE_SECTION.theme.href)
}
