import { Metadata } from 'next'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { isUnknownHost } from '@/lib/conference/guard'
import { getVolunteerById } from '@/lib/volunteer/sanity'
import { verifyVolunteerConfirmToken } from '@/lib/volunteer/token'
import { VolunteerStatus } from '@/lib/volunteer/types'
import {
  VolunteerConfirmClient,
  type VolunteerConfirmState,
} from '@/components/volunteer/VolunteerConfirmClient'
import { Container } from '@/components/Container'
import { BackgroundImage } from '@/components/BackgroundImage'
import { resolveMetadataBrand } from '@/lib/seo/brand'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await resolveMetadataBrand()
  return {
    title: { absolute: `Confirm Volunteer Attendance | ${brand}` },
    robots: { index: false, follow: false },
  }
}

export default async function VolunteerConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const [{ token }, { conference, error }] = await Promise.all([
    searchParams,
    getConferenceForCurrentDomain({ includeVolunteerRegistrationLink: true }),
  ])

  if (isUnknownHost({ conference, error })) {
    return (
      <div className="relative py-20 sm:pt-36 sm:pb-24">
        <BackgroundImage className="-top-36 -bottom-14" />
        <Container className="relative">
          <div className="mx-auto max-w-2xl lg:max-w-4xl lg:px-12">
            <h1 className="font-jetbrains text-4xl font-bold tracking-tighter text-brand-cloud-blue sm:text-6xl dark:text-blue-400">
              Conference not found
            </h1>
          </div>
        </Container>
      </div>
    )
  }

  const contactEmail = conference.contactEmail || conference.cfpEmail

  let initialState: VolunteerConfirmState = 'invalid'
  let volunteerName: string | undefined
  let confirmedAt: string | undefined

  const verification = verifyVolunteerConfirmToken(token)
  if (verification.ok && verification.payload.conferenceId === conference._id) {
    const { volunteer } = await getVolunteerById(
      verification.payload.volunteerId,
    )
    if (
      volunteer &&
      volunteer.conference?._id === conference._id &&
      volunteer.email?.trim().toLowerCase() === verification.payload.email
    ) {
      volunteerName = volunteer.name
      confirmedAt = volunteer.confirmedAt
      if (volunteer.status === VolunteerStatus.CONFIRMED) {
        initialState = 'confirmed'
      } else if (volunteer.status === VolunteerStatus.APPROVED) {
        initialState = 'ready'
      } else if (
        volunteer.status === VolunteerStatus.REJECTED &&
        volunteer.reviewNotes?.startsWith('Declined by volunteer')
      ) {
        initialState = 'declined'
      } else {
        initialState = 'not-approved'
      }
    }
  }

  return (
    <div className="relative py-20 sm:pt-36 sm:pb-24">
      <BackgroundImage className="-top-36 -bottom-14" />
      <Container className="relative">
        <div className="mx-auto max-w-2xl lg:max-w-4xl lg:px-12">
          <h1 className="font-jetbrains text-center text-3xl font-bold tracking-tighter text-brand-cloud-blue sm:text-5xl dark:text-blue-400">
            Volunteer Crew Confirmation
          </h1>
          <p className="font-inter mt-3 text-center text-base text-brand-slate-gray sm:text-lg dark:text-gray-300">
            {conference.title}
          </p>

          <div className="mt-10">
            <VolunteerConfirmClient
              initialState={initialState}
              token={token}
              volunteerName={volunteerName}
              conferenceTitle={conference.title}
              confirmedAt={confirmedAt}
              registrationUrl={
                initialState === 'confirmed'
                  ? (conference.volunteerRegistrationLink ?? null)
                  : null
              }
              slackInviteUrl={
                initialState === 'confirmed'
                  ? (conference.volunteerSlackInviteUrl ?? null)
                  : null
              }
              contactEmail={contactEmail}
            />
          </div>
        </div>
      </Container>
    </div>
  )
}
