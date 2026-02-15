import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ProposalAcceptTemplate } from '@/components/email/ProposalAcceptTemplate'
import { ProposalRejectTemplate } from '@/components/email/ProposalRejectTemplate'
import { ContractSigningTemplate } from '@/components/email/ContractSigningTemplate'
import { ContractSignedTemplate } from '@/components/email/ContractSignedTemplate'
import { ContractReminderTemplate } from '@/components/email/ContractReminderTemplate'
import {
  EnvelopeIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  UserGroupIcon,
  TicketIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline'

const meta = {
  title: 'Components/Data Display/Email Templates',
  parameters: {
    layout: 'fullscreen',
    options: {
      showPanel: false,
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const EmailPreviewFrame = ({
  children,
  from,
  to,
  subject,
  time,
}: {
  children: React.ReactNode
  from: string
  to: string
  subject: string
  time: string
}) => (
  <div className="overflow-hidden rounded-xl bg-gray-100 shadow-2xl">
    <div className="rounded-t-lg bg-gray-200 px-4 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="h-3 w-3 rounded-full bg-red-500"></div>
          <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
          <div className="h-3 w-3 rounded-full bg-green-500"></div>
        </div>
        <div className="font-inter text-sm font-medium text-gray-600">Mail</div>
        <div className="w-16"></div>
      </div>
    </div>
    <div className="border-b border-gray-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center space-x-4">
          <span className="font-semibold text-gray-900">From:</span>
          <span className="text-gray-600">{from}</span>
        </div>
        <div className="text-xs text-gray-500">{time}</div>
      </div>
      <div className="mt-1 flex items-center space-x-4 text-sm">
        <span className="font-semibold text-gray-900">To:</span>
        <span className="text-gray-600">{to}</span>
      </div>
      <div className="mt-2">
        <h5 className="font-semibold text-gray-900">{subject}</h5>
      </div>
    </div>
    <div className="rounded-b-lg bg-white p-6">{children}</div>
  </div>
)

const EmailCategoryCard = ({
  icon: Icon,
  title,
  description,
  templates,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  templates: string[]
  color: string
}) => (
  <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
    <div className="mb-4 flex items-center space-x-3">
      <div className={`rounded-lg p-2 ${color}`}>
        <Icon className="h-6 w-6 text-white" />
      </div>
      <h3 className="font-space-grotesk text-lg font-semibold text-brand-slate-gray dark:text-white">
        {title}
      </h3>
    </div>
    <p className="font-inter mb-4 text-sm text-gray-600 dark:text-gray-400">
      {description}
    </p>
    <ul className="space-y-2">
      {templates.map((template) => (
        <li
          key={template}
          className="font-inter flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
          <span>{template}</span>
        </li>
      ))}
    </ul>
  </div>
)

export const EmailTemplates: Story = {
  render: () => (
    <div className="min-h-screen bg-white p-8 dark:bg-gray-900">
      <div className="mx-auto max-w-5xl">
        <h1 className="font-space-grotesk mb-4 text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
          Email Template System
        </h1>
        <p className="font-inter mb-12 text-lg text-brand-slate-gray dark:text-gray-300">
          Professional email templates for all conference communications.
          Templates follow brand guidelines with consistent styling and clear
          hierarchy.
        </p>

        {/* Live Acceptance Email */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Proposal Accepted Email
          </h2>
          <p className="font-inter mb-6 text-gray-600 dark:text-gray-400">
            Sent when a speaker&apos;s proposal is accepted for the conference.
          </p>
          <EmailPreviewFrame
            from="Cloud Native Days Norway <hello@cloudnativedays.no>"
            to="alice.johnson@example.com"
            subject="🎉 Your proposal has been accepted!"
            time="Just now"
          >
            <ProposalAcceptTemplate
              speakerName="Alice Johnson"
              proposalTitle="Building Resilient Kubernetes Applications"
              eventName="Cloud Native Days Norway 2026"
              eventLocation="Oslo, Norway"
              eventDate="June 15-16, 2026"
              eventUrl="https://cloudnativedays.no"
              confirmUrl="https://cloudnativedays.no/cfp/confirm/abc123"
              comment="We loved the practical approach in your proposal. The reviewers were especially excited about the real-world examples you mentioned!"
              socialLinks={[
                'https://twitter.com/cloudnativeno',
                'https://linkedin.com/company/cloudnativeno',
              ]}
            />
          </EmailPreviewFrame>
        </section>

        {/* Live Rejection Email */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Proposal Not Selected Email
          </h2>
          <p className="font-inter mb-6 text-gray-600 dark:text-gray-400">
            Sent when a speaker&apos;s proposal is not selected, with
            constructive feedback.
          </p>
          <EmailPreviewFrame
            from="Cloud Native Days Norway <hello@cloudnativedays.no>"
            to="bob.smith@example.com"
            subject="Thank you for your proposal submission"
            time="Just now"
          >
            <ProposalRejectTemplate
              speakerName="Bob Smith"
              proposalTitle="Introduction to Container Orchestration"
              eventName="Cloud Native Days Norway 2026"
              eventLocation="Oslo, Norway"
              eventDate="June 15-16, 2026"
              eventUrl="https://cloudnativedays.no"
              comment="While we loved the topic, we received many similar introductory submissions this year. Consider focusing on a more specific use case or advanced pattern for next time!"
              socialLinks={[
                'https://twitter.com/cloudnativeno',
                'https://linkedin.com/company/cloudnativeno',
              ]}
            />
          </EmailPreviewFrame>
        </section>

        {/* Contract Signing Email */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Contract Signing Email
          </h2>
          <p className="font-inter mb-6 text-gray-600 dark:text-gray-400">
            Sent to the designated signer when a sponsorship contract is ready
            for digital signing via Adobe Sign.
          </p>
          <EmailPreviewFrame
            from="Cloud Native Days Norway <hello@cloudnativedays.no>"
            to="sponsor@acmecorp.com"
            subject="Sponsorship Agreement — Cloud Native Days Norway 2026"
            time="Just now"
          >
            <ContractSigningTemplate
              sponsorName="Acme Corp"
              signerName="Jane Smith"
              signerEmail="sponsor@acmecorp.com"
              signingUrl="https://secure.adobesign.com/sign/abc123"
              tierName="Service"
              contractValue="50 000 NOK"
              eventName="Cloud Native Days Norway 2026"
              eventLocation="Oslo, Norway"
              eventDate="June 15-16, 2026"
              eventUrl="https://cloudnativedays.no"
              socialLinks={[
                'https://twitter.com/cloudnativeno',
                'https://linkedin.com/company/cloudnativeno',
              ]}
            />
          </EmailPreviewFrame>
        </section>

        {/* Contract Reminder Email */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Contract Reminder Email
          </h2>
          <p className="font-inter mb-6 text-gray-600 dark:text-gray-400">
            Sent automatically by a daily cron job when a contract has been
            pending for more than 5 days (up to 2 reminders).
          </p>
          <EmailPreviewFrame
            from="Cloud Native Days Norway <hello@cloudnativedays.no>"
            to="sponsor@acmecorp.com"
            subject="Reminder: Sponsorship Agreement — Cloud Native Days Norway 2026"
            time="5 days after contract sent"
          >
            <ContractReminderTemplate
              sponsorName="Acme Corp"
              signerName="Jane Smith"
              signingUrl="https://secure.adobesign.com/sign/abc123"
              reminderNumber={1}
              eventName="Cloud Native Days Norway 2026"
              eventLocation="Oslo, Norway"
              eventDate="June 15-16, 2026"
              eventUrl="https://cloudnativedays.no"
              socialLinks={[
                'https://twitter.com/cloudnativeno',
                'https://linkedin.com/company/cloudnativeno',
              ]}
            />
          </EmailPreviewFrame>
        </section>

        {/* Contract Signed Confirmation Email */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Contract Signed Confirmation Email
          </h2>
          <p className="font-inter mb-6 text-gray-600 dark:text-gray-400">
            Sent automatically to the sponsor after they successfully sign the
            sponsorship agreement, with a copy of the signed PDF attached.
          </p>
          <EmailPreviewFrame
            from="Cloud Native Days Norway <hello@cloudnativedays.no>"
            to="sponsor@acmecorp.com"
            subject="Contract confirmed – Welcome aboard Cloud Native Days Norway 2026!"
            time="Immediately after signing"
          >
            <ContractSignedTemplate
              sponsorName="Acme Corp"
              signerName="Jane Smith"
              tierName="Service"
              contractValue="50 000 NOK"
              eventName="Cloud Native Days Norway 2026"
              eventLocation="Oslo, Norway"
              eventDate="June 15-16, 2026"
              eventUrl="https://cloudnativedays.no"
              socialLinks={[
                'https://twitter.com/cloudnativeno',
                'https://linkedin.com/company/cloudnativeno',
              ]}
            />
          </EmailPreviewFrame>
        </section>

        {/* Template Categories */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            All Template Categories
          </h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <EmailCategoryCard
              icon={EnvelopeIcon}
              title="CFP Emails"
              description="Call for Papers communication templates"
              templates={[
                'CFP Open Announcement',
                'Submission Confirmation',
                'Review Request',
                'CFP Closing Reminder',
              ]}
              color="bg-brand-cloud-blue"
            />

            <EmailCategoryCard
              icon={CheckCircleIcon}
              title="Acceptance Emails"
              description="Speaker acceptance and confirmation"
              templates={[
                'Talk Accepted',
                'Workshop Accepted',
                'Lightning Talk Accepted',
                'Waitlist Notification',
              ]}
              color="bg-brand-fresh-green"
            />

            <EmailCategoryCard
              icon={XCircleIcon}
              title="Rejection Emails"
              description="Thoughtful rejection communications"
              templates={[
                'Talk Not Selected',
                'Feedback Included',
                'Encouragement Template',
                'Alternative Options',
              ]}
              color="bg-gray-500"
            />

            <EmailCategoryCard
              icon={ClockIcon}
              title="Reminder Emails"
              description="Event and deadline reminders"
              templates={[
                'Speaker Preparation',
                'Schedule Confirmation',
                'Travel Reminder',
                'Day-Before Reminder',
              ]}
              color="bg-brand-nordic-purple"
            />

            <EmailCategoryCard
              icon={DocumentTextIcon}
              title="Contract Emails"
              description="Digital contract signing and reminder templates"
              templates={[
                'Contract Signing Request',
                'Contract Signed Confirmation',
                'Contract Reminder (#1)',
                'Contract Reminder (#2)',
              ]}
              color="bg-brand-cloud-blue"
            />

            <EmailCategoryCard
              icon={UserGroupIcon}
              title="Sponsor Emails"
              description="Sponsor communication templates"
              templates={[
                'Welcome Package',
                'Logistics Information',
                'Thank You',
              ]}
              color="bg-accent-yellow"
            />

            <EmailCategoryCard
              icon={TicketIcon}
              title="Attendee Emails"
              description="Attendee communication templates"
              templates={[
                'Registration Confirmation',
                'Schedule Release',
                'Day-Of Information',
                'Post-Event Survey',
              ]}
              color="bg-rose-500"
            />
          </div>
        </section>

        {/* Implementation */}
        <section>
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Implementation
          </h2>
          <div className="rounded-xl border border-brand-cloud-blue/20 bg-brand-sky-mist p-6">
            <h3 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-cloud-blue">
              Using Email Templates
            </h3>
            <p className="font-inter mb-4 text-sm text-brand-slate-gray">
              Email templates are React components in{' '}
              <code className="rounded bg-white px-1 text-xs">
                /src/components/email/
              </code>{' '}
              sent via Resend.
            </p>
            <pre className="font-jetbrains overflow-x-auto rounded-lg bg-white p-4 text-sm text-gray-700">
              {`import { ProposalAcceptTemplate } from '@/components/email/ProposalAcceptTemplate'
import { sendEmail } from '@/lib/email'

await sendEmail({
  to: speaker.email,
  subject: '🎉 Your proposal has been accepted!',
  react: ProposalAcceptTemplate({
    speakerName: speaker.name,
    proposalTitle: talk.title,
    eventName: conference.title,
    eventLocation: conference.location,
    eventDate: formatDate(conference.startDate),
    eventUrl: conference.url,
    confirmUrl: \`\${baseUrl}/cfp/confirm/\${token}\`,
    comment: reviewComment,
    socialLinks: conference.socialLinks,
  }),
})`}
            </pre>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-cloud-blue">
                Email Structure
              </h3>
              <ul className="font-inter space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li>
                  • <strong>Header:</strong> Title with brand color
                </li>
                <li>
                  • <strong>Greeting:</strong> Personalized &ldquo;Dear
                  Name&rdquo;
                </li>
                <li>
                  • <strong>Body:</strong> Clear message hierarchy
                </li>
                <li>
                  • <strong>Event Details:</strong> Blue info box
                </li>
                <li>
                  • <strong>CTA:</strong> Action button when needed
                </li>
                <li>
                  • <strong>Footer:</strong> Social links + contact info
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-fresh-green">
                Best Practices
              </h3>
              <ul className="font-inter space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li>• Max width: 600px for email clients</li>
                <li>• Use system fonts for compatibility</li>
                <li>• Single clear CTA per email</li>
                <li>• Test across email clients</li>
                <li>• Keep subject lines under 50 chars</li>
                <li>• Always include feedback for rejections</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  ),
}
