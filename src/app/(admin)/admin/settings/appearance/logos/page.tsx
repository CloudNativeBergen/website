import { redirect } from 'next/navigation'
import { APPEARANCE_SECTION } from '@/lib/settings/appearance'

/**
 * Legacy sub-page → the Logos section of the one Appearance page. Also the
 * target of the activation checklist's "Brand logo" row before it moved to the
 * anchor, so it must keep resolving.
 */
export default function AppearanceLogosRedirect(): never {
  redirect(APPEARANCE_SECTION.logos.href)
}
