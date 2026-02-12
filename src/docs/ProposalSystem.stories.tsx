import type { Meta, StoryObj } from '@storybook/nextjs-vite'

const meta = {
  title: 'Systems/Proposals',
  parameters: {
    layout: 'fullscreen',
    options: { showPanel: false },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Architecture: Story = {
  render: () => (
    <div className="min-h-screen bg-white p-8 dark:bg-gray-900">
      <div className="mx-auto max-w-5xl">
        <h1 className="font-space-grotesk mb-4 text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
          Proposals &amp; CFP System
        </h1>
        <p className="font-inter mb-12 text-lg text-brand-slate-gray dark:text-gray-300">
          Manages the full lifecycle of talk proposals — from Call for Papers
          submission through peer review, acceptance, and confirmation. Includes
          co-speaker invitations, attachment management, and email
          notifications.
        </p>

        {/* Data Model */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            Data Model
          </h2>
          <div className="space-y-6">
            <SchemaCard
              name="talk"
              desc="The core proposal document. Also referenced by the Program system for scheduling."
              fields={[
                ['title', 'Talk title (required)'],
                ['description', 'Portable Text blocks'],
                ['format', 'lightning_10, presentation_25, workshop_120, etc.'],
                ['level', 'beginner, intermediate, advanced'],
                ['language', 'norwegian or english'],
                ['audiences[]', 'Target audience tags'],
                ['topics[]', 'References to topic'],
                ['speakers[]', 'References to speaker (1-4 based on format)'],
                ['conference', 'Reference to conference (required)'],
                [
                  'status',
                  'draft → submitted → accepted → confirmed (or rejected/withdrawn/deleted)',
                ],
                ['outline', 'Internal reviewer-only notes'],
                ['attachments[]', 'File or URL attachments'],
                ['capacity', 'Max attendees (workshops only)'],
                [
                  'audienceFeedback',
                  'Green/yellow/red card counts (post-conference)',
                ],
                ['tos', 'Terms of service accepted'],
              ]}
            />

            <SchemaCard
              name="review"
              desc="Organizer review of a submitted proposal. Scoring across three dimensions."
              fields={[
                ['reviewer', 'Reference to speaker (organizer)'],
                ['proposal', 'Reference to talk'],
                ['conference', 'Reference to conference'],
                ['score.content', '0-10 content quality rating'],
                ['score.relevance', '0-10 topic relevance rating'],
                ['score.speaker', '0-10 speaker experience rating'],
                ['comment', 'Reviewer text comment'],
              ]}
            />

            <SchemaCard
              name="coSpeakerInvitation"
              desc="Invitation for a co-speaker to join a proposal. Token-based with 14-day expiry."
              fields={[
                ['proposal', 'Reference to talk'],
                ['invitedBy', 'Reference to speaker (inviter)'],
                ['invitedEmail / invitedName', 'Invitee details'],
                ['status', 'pending → accepted/declined/expired/canceled'],
                ['token', 'Unique invitation token'],
                ['expiresAt', '14 days from creation'],
                ['acceptedSpeaker', 'Reference to speaker (once accepted)'],
              ]}
            />

            <SchemaCard
              name="topic"
              desc="Conference topics for categorizing proposals."
              fields={[
                ['title', 'Topic name'],
                ['description', 'Topic description'],
                ['color', 'Hex color for badges'],
                ['slug', 'URL-safe identifier'],
              ]}
            />
          </div>
        </section>

        {/* Status State Machine */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            Proposal Lifecycle
          </h2>
          <p className="font-inter mb-6 text-brand-slate-gray dark:text-gray-300">
            Status transitions are enforced by the{' '}
            <code className="rounded bg-gray-100 px-1 text-xs dark:bg-gray-700">
              actionStateMachine()
            </code>{' '}
            function. Speaker and organizer actions are distinct.
          </p>

          {/* Visual Status Flow */}
          <div className="mb-8 flex flex-wrap items-center justify-center gap-2">
            <StatusBadge label="Draft" color="bg-gray-200 text-gray-700" />
            <Arrow />
            <StatusBadge label="Submitted" color="bg-blue-100 text-blue-700" />
            <Arrow />
            <StatusBadge label="Accepted" color="bg-green-100 text-green-700" />
            <Arrow />
            <StatusBadge
              label="Confirmed"
              color="bg-emerald-100 text-emerald-700"
            />
          </div>
          <div className="mb-8 flex flex-wrap items-center justify-center gap-3 text-sm text-gray-500">
            <span className="rounded bg-red-50 px-2 py-1 text-xs text-red-600">
              Rejected
            </span>
            <span className="rounded bg-yellow-50 px-2 py-1 text-xs text-yellow-700">
              Withdrawn
            </span>
            <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-500">
              Deleted
            </span>
          </div>

          {/* Transition Table */}
          <div className="overflow-x-auto">
            <table className="font-inter w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="py-2 pr-4 text-left text-xs font-semibold text-gray-500">
                    From
                  </th>
                  <th className="py-2 pr-4 text-left text-xs font-semibold text-gray-500">
                    Action
                  </th>
                  <th className="py-2 pr-4 text-left text-xs font-semibold text-gray-500">
                    To
                  </th>
                  <th className="py-2 text-left text-xs font-semibold text-gray-500">
                    Who
                  </th>
                </tr>
              </thead>
              <tbody className="text-brand-slate-gray dark:text-gray-300">
                <TransitionRow
                  from="Draft"
                  action="Submit"
                  to="Submitted"
                  who="Speaker"
                />
                <TransitionRow
                  from="Draft"
                  action="Delete"
                  to="Deleted"
                  who="Speaker"
                />
                <TransitionRow
                  from="Submitted"
                  action="Unsubmit"
                  to="Draft"
                  who="Speaker"
                />
                <TransitionRow
                  from="Submitted"
                  action="Accept"
                  to="Accepted"
                  who="Organizer"
                />
                <TransitionRow
                  from="Submitted"
                  action="Reject"
                  to="Rejected"
                  who="Organizer"
                />
                <TransitionRow
                  from="Accepted"
                  action="Confirm"
                  to="Confirmed"
                  who="Speaker"
                />
                <TransitionRow
                  from="Accepted"
                  action="Withdraw"
                  to="Withdrawn"
                  who="Speaker"
                />
                <TransitionRow
                  from="Accepted"
                  action="Reject"
                  to="Rejected"
                  who="Organizer"
                />
                <TransitionRow
                  from="Rejected"
                  action="Accept"
                  to="Accepted"
                  who="Organizer"
                />
                <TransitionRow
                  from="Confirmed"
                  action="Withdraw"
                  to="Withdrawn"
                  who="Speaker"
                />
              </tbody>
            </table>
          </div>
        </section>

        {/* Review System */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            Review System
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-fresh-green dark:text-green-400">
                Scoring
              </h3>
              <ul className="font-inter space-y-2 text-sm text-brand-slate-gray dark:text-gray-400">
                <li>
                  • <strong>Content</strong> — quality and depth (0-10)
                </li>
                <li>
                  • <strong>Relevance</strong> — topic fit for conference (0-10)
                </li>
                <li>
                  • <strong>Speaker</strong> — experience and delivery (0-10)
                </li>
                <li>• Max 30 points per review</li>
                <li>
                  • Average rating normalized to 0-5 stars:{' '}
                  <code className="text-xs">
                    (total / (reviewCount &times; 15)) &times; 5
                  </code>
                </li>
              </ul>
            </div>
            <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-fresh-green dark:text-green-400">
                Workflow
              </h3>
              <ul className="font-inter space-y-2 text-sm text-brand-slate-gray dark:text-gray-400">
                <li>
                  • Organizers review via{' '}
                  <code className="text-xs">/admin/proposals/[id]</code>
                </li>
                <li>• One review per organizer per proposal</li>
                <li>
                  • &quot;Next unreviewed&quot; button for efficient review
                  queues
                </li>
                <li>
                  • Reviews are created/updated via REST API, fetched inline
                  with GROQ
                </li>
                <li>
                  • Status changes trigger email notifications to speakers
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Routes */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            Routes
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-slate-gray dark:text-gray-200">
                Speaker (Public)
              </h3>
              <div className="space-y-2">
                <RouteCard path="/cfp" label="CFP landing page" />
                <RouteCard
                  path="/cfp/list"
                  label="Speaker dashboard — all conferences"
                />
                <RouteCard
                  path="/cfp/proposal/[[...id]]"
                  label="Create or edit proposal"
                />
                <RouteCard
                  path="/cfp/profile"
                  label="Speaker profile editing"
                />
                <RouteCard path="/cfp/workshop/[id]" label="Workshop details" />
              </div>
            </div>
            <div>
              <h3 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-slate-gray dark:text-gray-200">
                Admin
              </h3>
              <div className="space-y-2">
                <RouteCard
                  path="/admin/proposals"
                  label="Proposal list with filters and stats"
                />
                <RouteCard
                  path="/admin/proposals/[id]"
                  label="Proposal detail + review panel"
                />
              </div>
            </div>
          </div>
        </section>

        {/* tRPC API */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            tRPC API
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-jetbrains mb-3 text-sm font-semibold text-brand-nordic-purple dark:text-purple-400">
                Speaker Procedures
              </h3>
              <ul className="font-inter space-y-1 text-xs text-brand-slate-gray dark:text-gray-400">
                <li>
                  <code>proposal.list</code> — list own proposals
                </li>
                <li>
                  <code>proposal.getById</code> — get single proposal
                </li>
                <li>
                  <code>proposal.create</code> — create (max 3/conference, CFP
                  must be open)
                </li>
                <li>
                  <code>proposal.update</code> — edit (CFP must be open)
                </li>
                <li>
                  <code>proposal.action</code> — state machine transitions
                </li>
                <li>
                  <code>proposal.uploadAttachment</code>
                </li>
                <li>
                  <code>proposal.invitation.send/respond/list/cancel</code>
                </li>
              </ul>
            </div>
            <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-jetbrains mb-3 text-sm font-semibold text-brand-nordic-purple dark:text-purple-400">
                Admin Procedures
              </h3>
              <ul className="font-inter space-y-1 text-xs text-brand-slate-gray dark:text-gray-400">
                <li>
                  <code>proposal.admin.list</code> — all proposals with reviews
                </li>
                <li>
                  <code>proposal.admin.getById</code> — full detail
                </li>
                <li>
                  <code>proposal.admin.create/update/delete</code>
                </li>
                <li>
                  <code>proposal.admin.updateAudienceFeedback</code>
                </li>
                <li>
                  <code>proposal.admin.updateAttachments</code>
                </li>
                <li>
                  <code>proposals.searchTalks</code> — search for featured talk
                  selection
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Data Flow */}
        <section>
          <h2 className="font-space-grotesk mb-6 text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            Data Flow
          </h2>
          <div className="rounded-lg border border-brand-frosted-steel bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
            <pre className="font-jetbrains overflow-x-auto text-sm text-brand-slate-gray dark:text-gray-300">
              {`Speaker submits proposal
  → ProposalForm → tRPC proposal.create → Sanity (talk document)

Organizer reviews
  → /admin/proposals/[id] → ProposalReviewForm
  → POST /admin/api/proposals/[id]/review → Sanity (review document)

Status transitions
  → AdminActionBar → tRPC proposal.action
  → actionStateMachine() → updateProposalStatus()
  → eventBus → email notification (accept/reject templates)

Co-speaker invitations
  → tRPC proposal.invitation.send → token email
  → Invitee clicks link → proposal.invitation.respond → links speaker`}
            </pre>
          </div>
        </section>
      </div>
    </div>
  ),
}

function SchemaCard({
  name,
  desc,
  fields,
}: {
  name: string
  desc: string
  fields: [string, string][]
}) {
  return (
    <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
      <h3 className="font-jetbrains mb-3 text-lg font-semibold text-brand-nordic-purple dark:text-purple-400">
        {name}
      </h3>
      <p className="font-inter mb-4 text-sm text-brand-slate-gray dark:text-gray-300">
        {desc}
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {fields.map(([fieldName, fieldDesc]) => (
          <div key={fieldName}>
            <code className="font-jetbrains text-xs text-brand-cloud-blue dark:text-blue-400">
              {fieldName}
            </code>
            <p className="font-inter text-xs text-brand-slate-gray dark:text-gray-400">
              {fieldDesc}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className={`font-inter rounded-full px-4 py-2 text-sm font-semibold ${color}`}
    >
      {label}
    </span>
  )
}

function Arrow() {
  return (
    <span className="text-lg text-gray-400 dark:text-gray-600">&rarr;</span>
  )
}

function TransitionRow({
  from,
  action,
  to,
  who,
}: {
  from: string
  action: string
  to: string
  who: string
}) {
  return (
    <tr className="border-b border-gray-100 dark:border-gray-800">
      <td className="py-2 pr-4">{from}</td>
      <td className="py-2 pr-4 font-medium">{action}</td>
      <td className="py-2 pr-4">{to}</td>
      <td className="py-2">
        <span
          className={`rounded px-2 py-0.5 text-xs ${who === 'Organizer' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}
        >
          {who}
        </span>
      </td>
    </tr>
  )
}

function RouteCard({ path, label }: { path: string; label: string }) {
  return (
    <div className="rounded border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
      <span className="font-jetbrains text-sm text-gray-600 dark:text-gray-400">
        {path}
      </span>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  )
}
