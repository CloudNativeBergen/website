import { BackgroundImage } from '@/components/BackgroundImage'
import { Container } from '@/components/Container'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

export const metadata = {
  title: 'Code of Conduct - Cloud Native Bergen',
  description:
    'Community Code of Conduct for Cloud Native Bergen events and activities.',
}

export default async function CodeOfConduct() {
  const { conference } = await getConferenceForCurrentDomain()
  const organizerName = conference?.organizer || 'Cloud Native Bergen'

  return (
    <>
      <div className="relative py-20 sm:pt-36 sm:pb-24">
        <BackgroundImage className="-top-36 -bottom-14" />
        <Container className="relative">
          <div className="mx-auto max-w-4xl">
            <h1 className="font-jetbrains text-4xl font-bold tracking-tighter text-brand-cloud-blue sm:text-6xl">
              Community Code of Conduct
            </h1>
            <div className="font-inter mt-6 space-y-6 text-xl tracking-tight text-brand-slate-gray">
              <p>
                As participants, speakers, sponsors, volunteers, organizers, and
                contributors in the
                {organizerName} community, we pledge to respect all people who
                participate in our events and activities.
              </p>
              <p>
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

          <div className="mx-auto mt-16 max-w-4xl rounded-xl border border-brand-frosted-steel bg-white p-8 shadow-sm">
            <div className="prose prose-lg max-w-none">
              <h2 className="font-space-grotesk text-2xl font-semibold text-brand-cloud-blue">
                Scope
              </h2>
              <div className="font-inter text-brand-slate-gray">
                <p>This code of conduct applies to:</p>
                <ul className="mt-4 ml-6 list-disc space-y-2">
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

              <h2 className="font-space-grotesk mt-8 text-2xl font-semibold text-brand-cloud-blue">
                Our Standards
              </h2>
              <div className="font-inter text-brand-slate-gray">
                <p>
                  The {organizerName} Community is open, inclusive and
                  respectful. Every member of our community has the right to
                  have their identity respected and to participate in a safe,
                  welcoming environment.
                </p>

                <h3 className="font-space-grotesk mt-6 text-lg font-semibold text-brand-slate-gray">
                  Examples of behavior that contributes to a positive
                  environment:
                </h3>
                <ul className="mt-4 ml-6 list-disc space-y-2">
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

                <h3 className="font-space-grotesk mt-6 text-lg font-semibold text-brand-slate-gray">
                  Examples of unacceptable behavior:
                </h3>
                <ul className="mt-4 ml-6 list-disc space-y-2">
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

                <h3 className="font-space-grotesk mt-6 text-lg font-semibold text-brand-slate-gray">
                  Additional prohibited behaviors:
                </h3>
                <ul className="mt-4 ml-6 list-disc space-y-2">
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

              <h2 className="font-space-grotesk mt-8 text-2xl font-semibold text-brand-cloud-blue">
                Reporting
              </h2>
              <div className="font-inter text-brand-slate-gray">
                <p>
                  We encourage reporting of any incidents that violate this Code
                  of Conduct. Reports can be made in the following ways:
                </p>

                <ul className="mt-4 ml-6 list-disc space-y-2">
                  <li>
                    <strong>Email:</strong> Contact the organizers via{' '}
                    <a
                      href={`mailto:${conference.contact_email}`}
                      className="text-brand-cloud-blue underline hover:text-brand-cloud-blue-hover"
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

                <p className="mt-6">
                  <strong>What to include in your report:</strong>
                </p>
                <ul className="mt-4 ml-6 list-disc space-y-2">
                  <li>Your contact information</li>
                  <li>Names of any witnesses or other people involved</li>
                  <li>When and where the incident occurred</li>
                  <li>A detailed description of what happened</li>
                  <li>Any additional context you believe is relevant</li>
                </ul>

                <p className="mt-6">
                  All reports will be handled with discretion and
                  confidentiality. You can expect a response within three
                  business days. We are committed to making our community a safe
                  space for everyone.
                </p>
              </div>

              <h2 className="font-space-grotesk mt-8 text-2xl font-semibold text-brand-cloud-blue">
                Enforcement
              </h2>
              <div className="font-inter text-brand-slate-gray">
                <p>
                  Upon review and investigation of a reported incident, the
                  Cloud Native Bergen organizing team will determine what action
                  is appropriate based on this Code of Conduct and its related
                  documentation.
                </p>

                <p className="mt-4">
                  <strong>
                    Possible consequences may include, but are not limited to:
                  </strong>
                </p>
                <ul className="mt-4 ml-6 list-disc space-y-2">
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

                <p className="mt-6">
                  The severity of consequences will be determined based on the
                  nature, context, and impact of the violation, as well as the
                  individual&apos;s history within the community.
                </p>
              </div>

              <h2 className="font-space-grotesk mt-8 text-2xl font-semibold text-brand-cloud-blue">
                Acknowledgements
              </h2>
              <div className="font-inter text-brand-slate-gray">
                <p>
                  This Code of Conduct is adapted from the{' '}
                  <a
                    href="https://github.com/cncf/foundation/blob/master/code-of-conduct.md"
                    className="text-brand-cloud-blue underline hover:text-brand-cloud-blue-hover"
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
