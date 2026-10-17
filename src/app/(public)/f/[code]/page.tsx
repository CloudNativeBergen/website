import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { AttendeeFeedbackPage } from '@/components/feedback/AttendeeFeedbackPage'
import type { AttendeeFeedbackState } from '@/components/feedback/AttendeeFeedbackPage'
import { isConferenceUnavailable, isUnknownHost } from '@/lib/conference/guard'
import { pickConferenceLogoProps } from '@/lib/conference/logo'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { resolveFeedbackPage } from '@/lib/feedback/server'

/** The code is the whole URL: never indexed (speaker feedback spec §7.1). */
export const metadata: Metadata = {
  title: 'Session feedback',
  robots: { index: false, follow: false },
}

/**
 * `/f/<code>` — the attendee page a Feedback Code's QR opens (speaker
 * feedback spec §7). The conference is the one serving the Host; a code is
 * looked up only in ITS index, so another tenant's code is Unknown here.
 */
export default async function FeedbackCodePage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const resolution = await getConferenceForCurrentDomain()

  // A failed read is not "no conference here" (`guard.ts`).
  if (isConferenceUnavailable(resolution)) {
    return <AttendeeFeedbackPage logo={null} page={{ state: 'unavailable' }} />
  }
  if (isUnknownHost(resolution)) notFound()

  const { conference } = resolution
  await connection()
  let page: AttendeeFeedbackState
  try {
    page = await resolveFeedbackPage(conference, code, new Date())
  } catch (error) {
    // Not Unknown: a code that exists must not be told it is invalid because
    // a read failed. A thrown read is never cached, so a retry reads again.
    console.error('Could not resolve a Feedback Code', error)
    page = { state: 'unavailable' }
  }

  return (
    <AttendeeFeedbackPage
      logo={pickConferenceLogoProps(conference)}
      page={page}
    />
  )
}
