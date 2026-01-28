import { BackgroundImage } from '@/components/BackgroundImage'
import { Container } from '@/components/Container'
import { getConferenceForDomain } from '@/lib/conference/sanity'
import { cacheLife, cacheTag } from 'next/cache'
import { headers } from 'next/headers'

export const metadata = {
  title: 'Code of Conduct - Cloud Native Days Norway',
  description:
    'Community Code of Conduct for Cloud Native Days Norway events and activities.',
}

async function CachedConductContent({ domain }: { domain: string }) {
  'use cache'
  cacheLife('max')
  cacheTag('content:conduct')

  const { conference } = await getConferenceForDomain(domain)
  const organizerName = conference?.organizer || 'Cloud Native Days Norway'

  return (
    <>
      <div className="relative py-20 sm:pt-36 sm:pb-24 print:py-8">
        <BackgroundImage className="-top-36 -bottom-14 print:hidden" />
        <Container className="relative print:max-w-none print:px-0">
          <div className="mx-auto max-w-4xl print:max-w-none">
            <h1 className="font-jetbrains text-4xl font-bold tracking-tighter text-brand-cloud-blue sm:text-6xl dark:text-blue-400 print:mb-4 print:text-3xl print:font-bold print:text-black">
              Community Code of Conduct
            </h1>
            <div className="font-inter mt-6 space-y-6 text-xl tracking-tight text-brand-slate-gray dark:text-gray-300 print:mt-4 print:space-y-4 print:text-base print:text-black">
              <p className="print:leading-relaxed">
                As participants, speakers, sponsors, volunteers, organizers, and
                contributors in the
                {organizerName} community, we pledge to respect all people who
                participate in our events and activities.
              </p>
              <p className="print:leading-relaxed">
                We are committed to making participation in {organizerName}{' '}
                events and the broader community a harassment-free experience
                for everyone, regardless of age, body size, caste, disability,
                ethnicity, level of experience, family status, gender, gender
                identity and expression, marital status, military or veteran
                status, nationality, personal appearance, race, religion, sexual
                orientation, socioeconomic status, tribe, or any other dimension
                of diversity.
              </p>
            </div>
          </div>

          <div className="mx-auto mt-16 max-w-4xl rounded-xl border border-brand-frosted-steel bg-white p-8 shadow-sm dark:border-gray-700 dark:bg-gray-800 print:mt-8 print:max-w-none print:rounded-none print:border-0 print:bg-white print:p-0 print:shadow-none">
            <div className="prose prose-lg print:prose-base dark:prose-invert max-w-none print:max-w-none">
              <h2 className="font-space-grotesk text-2xl font-semibold text-brand-cloud-blue dark:text-blue-400 print:mt-6 print:mb-3 print:text-xl print:font-bold print:text-black">
                Scope
              </h2>
              <div className="font-inter text-brand-slate-gray dark:text-gray-300 print:text-black">
                <p className="print:leading-relaxed">
                  This code of conduct applies to:
                </p>
                <ul className="mt-4 ml-6 list-disc space-y-2 print:mt-3 print:ml-4 print:space-y-1 print:leading-relaxed">
                  <li>
                    All {organizerName} community spaces, both online and
                    offline
                  </li>
                  <li>{organizerName} conferences, meetups, and events</li>
                  <li>
                    Interactions between community members in any context
                    related to {organizerName}
                  </li>
                  <li>
                    Other spaces when an individual {organizerName} community
                    participant&apos;s words or actions are directed at or are
                    about a {organizerName} project, the {organizerName}{' '}
                    community, or another {organizerName} community participant
                    in the context of a {organizerName} activity
                  </li>
                </ul>
              </div>

              <h2 className="font-space-grotesk mt-8 text-2xl font-semibold text-brand-cloud-blue dark:text-blue-400 print:mt-6 print:mb-3 print:text-xl print:font-bold print:text-black">
                Our Standards
              </h2>
              <div className="font-inter text-brand-slate-gray dark:text-gray-300 print:text-black">
                <p className="print:leading-relaxed">
                  The {organizerName} Community is open, inclusive and
                  respectful. Every member of our community has the right to
                  have their identity respected and to participate in a safe,
                  welcoming environment.
                </p>

                <h3 className="font-space-grotesk mt-6 text-lg font-semibold text-brand-slate-gray dark:text-gray-400 print:mt-4 print:mb-2 print:text-base print:font-bold print:text-black">
                  Examples of behavior that contributes to a positive
                  environment:
                </h3>
                <ul className="mt-4 ml-6 list-disc space-y-2 print:mt-3 print:ml-4 print:space-y-1 print:leading-relaxed">
                  <li>
                    Demonstrating empathy and kindness toward other people
                  </li>
                  <li>
                    Being respectful of differing opinions, viewpoints, and
                    experiences
                  </li>
                  <li>Giving and gracefully accepting constructive feedback</li>
                  <li>
                    Accepting responsibility and apologizing to those affected
                    by our mistakes, and learning from the experience
                  </li>
                  <li>
                    Focusing on what is best not just for us as individuals, but
                    for the overall community
                  </li>
                  <li>Using welcoming and inclusive language</li>
                  <li>
                    Being considerate of others&apos; time and contributions
                  </li>
                  <li>Respecting personal boundaries and consent</li>
                  <li>Supporting and encouraging fellow community members</li>
                </ul>

                <h3 className="font-space-grotesk mt-6 text-lg font-semibold text-brand-slate-gray dark:text-gray-400 print:mt-4 print:mb-2 print:text-base print:font-bold print:text-black">
                  Examples of unacceptable behavior:
                </h3>
                <ul className="mt-4 ml-6 list-disc space-y-2 print:mt-3 print:ml-4 print:space-y-1 print:leading-relaxed">
                  <li>
                    The use of sexualized language or imagery in any context
                  </li>
                  <li>
                    Trolling, insulting or derogatory comments, and personal or
                    political attacks
                  </li>
                  <li>Public or private harassment in any form</li>
                  <li>
                    Publishing others&apos; private information, such as a
                    physical or email address, without their explicit permission
                  </li>
                  <li>
                    Violence, threatening violence, or encouraging others to
                    engage in violent behavior
                  </li>
                  <li>Stalking or following someone without their consent</li>
                  <li>Unwelcome physical contact</li>
                  <li>Unwelcome sexual or romantic attention or advances</li>
                  <li>
                    Sustained disruption of talks, workshops, or other events
                  </li>
                  <li>
                    Intimidation or deliberate exclusion of individuals or
                    groups
                  </li>
                  <li>
                    Using {organizerName} events or community spaces for
                    political campaigning or promotion of political causes that
                    are unrelated to the advancement of cloud native technology
                    in ways that detract from the primary purpose of our
                    technical community.{' '}
                    <em>
                      Note: This policy does not restrict individuals&apos;
                      personal attire, including attire that expresses personal
                      beliefs or aspects of identity.
                    </em>
                  </li>
                  <li>
                    Other conduct which could reasonably be considered
                    inappropriate in a professional setting
                  </li>
                </ul>

                <h3 className="font-space-grotesk mt-6 text-lg font-semibold text-brand-slate-gray dark:text-gray-400 print:mt-4 print:mb-2 print:text-base print:font-bold print:text-black">
                  Additional prohibited behaviors:
                </h3>
                <ul className="mt-4 ml-6 list-disc space-y-2 print:mt-3 print:ml-4 print:space-y-1 print:leading-relaxed">
                  <li>
                    Providing knowingly false or misleading information in
                    connection with a Code of Conduct investigation or otherwise
                    intentionally tampering with an investigation
                  </li>
                  <li>
                    Retaliating against a person because they reported an
                    incident or provided information about an incident as a
                    witness
                  </li>
                  <li>
                    Encouraging or inciting others to violate the Code of
                    Conduct
                  </li>
                </ul>

                <p className="mt-6">
                  Community organizers, event staff, and project maintainers
                  have the right and responsibility to remove, edit, or reject
                  comments, commits, code, wiki edits, issues, and other
                  contributions that are not aligned to this Code of Conduct.
                  They may also temporarily or permanently remove individuals
                  from community spaces, events, or projects for behaviors that
                  they deem inappropriate, threatening, offensive, or harmful.
                </p>
              </div>

              <h2 className="font-space-grotesk mt-8 text-2xl font-semibold text-brand-cloud-blue dark:text-blue-400 print:mt-6 print:mb-3 print:text-xl print:font-bold print:text-black">
                Reporting
              </h2>
              <div className="font-inter text-brand-slate-gray dark:text-gray-300 print:text-black">
                <p className="print:leading-relaxed">
                  We encourage reporting of any incidents that violate this Code
                  of Conduct. Reports can be made in the following ways:
                </p>

                <ul className="mt-4 ml-6 list-disc space-y-2 print:mt-3 print:ml-4 print:space-y-1 print:leading-relaxed">
                  <li>
                    <strong>Email:</strong> Contact the organizers via{' '}
                    <a
                      href={`mailto:${conference.contact_email}`}
                      className="text-brand-cloud-blue underline hover:text-brand-cloud-blue-hover print:text-black print:underline"
                    >
                      {conference.contact_email}
                    </a>
                  </li>
                  <li>
                    <strong>At events:</strong> Approach any organizer,
                    volunteer, or staff member present at the event for
                    immediate assistance
                  </li>
                  <li>
                    <strong>Emergency situations:</strong> Contact local
                    emergency services if there is immediate danger to
                    anyone&apos;s safety
                  </li>
                </ul>

                <p className="mt-6 print:mt-4 print:leading-relaxed">
                  <strong>What to include in your report:</strong>
                </p>
                <ul className="mt-4 ml-6 list-disc space-y-2 print:mt-3 print:ml-4 print:space-y-1 print:leading-relaxed">
                  <li>Your contact information</li>
                  <li>Names of any witnesses or other people involved</li>
                  <li>When and where the incident occurred</li>
                  <li>A detailed description of what happened</li>
                  <li>Any additional context you believe is relevant</li>
                </ul>

                <p className="mt-6 print:mt-4 print:leading-relaxed">
                  All reports will be handled with discretion and
                  confidentiality. You can expect a response within three
                  business days. We are committed to making our community a safe
                  space for everyone.
                </p>
              </div>

              <h2 className="font-space-grotesk mt-8 text-2xl font-semibold text-brand-cloud-blue dark:text-blue-400 print:mt-6 print:mb-3 print:text-xl print:font-bold print:text-black">
                Enforcement
              </h2>
              <div className="font-inter text-brand-slate-gray dark:text-gray-300 print:text-black">
                <p className="print:leading-relaxed">
                  Upon review and investigation of a reported incident, the{' '}
                  {organizerName} organizing team will determine what action is
                  appropriate based on this Code of Conduct and its related
                  documentation.
                </p>

                <p className="mt-4 print:mt-3 print:leading-relaxed">
                  <strong>
                    Possible consequences may include, but are not limited to:
                  </strong>
                </p>
                <ul className="mt-4 ml-6 list-disc space-y-2 print:mt-3 print:ml-4 print:space-y-1 print:leading-relaxed">
                  <li>A private conversation or warning</li>
                  <li>A public reprimand</li>
                  <li>Temporary removal from community spaces or events</li>
                  <li>
                    Permanent ban from community spaces, events, or projects
                  </li>
                  <li>
                    Removal from speaker lineup, volunteer positions, or
                    organizing roles
                  </li>
                  <li>Revocation of sponsorship agreements</li>
                  <li>
                    Involvement of law enforcement if criminal activity is
                    suspected
                  </li>
                </ul>

                <p className="mt-6 print:mt-4 print:leading-relaxed">
                  The severity of consequences will be determined based on the
                  nature, context, and impact of the violation, as well as the
                  individual&apos;s history within the community.
                </p>
              </div>

              <h2 className="font-space-grotesk mt-8 text-2xl font-semibold text-brand-cloud-blue dark:text-blue-400 print:mt-6 print:mb-3 print:text-xl print:font-bold print:text-black">
                Acknowledgements
              </h2>
              <div className="font-inter text-brand-slate-gray dark:text-gray-300 print:text-black">
                <p className="print:leading-relaxed">
                  This Code of Conduct is adapted from the{' '}
                  <a
                    href="https://github.com/cncf/foundation/blob/master/code-of-conduct.md"
                    className="text-brand-cloud-blue underline hover:text-brand-cloud-blue-hover print:text-black print:underline"
                  >
                    CNCF Code of Conduct
                  </a>
                  .
                </p>
              </div>
            </div>
          </div>
        </Container>
      </div>
    </>
  )
}

export default async function ConductPage() {
  const headersList = await headers()
  const domain = headersList.get('host') || ''

  return <CachedConductContent domain={domain} />
}
