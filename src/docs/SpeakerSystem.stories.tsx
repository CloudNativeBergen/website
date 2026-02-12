import type { Meta, StoryObj } from '@storybook/nextjs-vite'

const meta = {
  title: 'Systems/Speakers',
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
          Speakers System
        </h1>
        <p className="font-inter mb-12 text-lg text-brand-slate-gray dark:text-gray-300">
          Speakers are the identity backbone of the platform. The speaker
          document doubles as the user account — OAuth sign-in creates or links
          a speaker profile. The system manages public profiles, admin
          management, OpenBadges credentials, and travel support.
        </p>

        {/* Data Model */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            Data Model
          </h2>
          <div className="space-y-6">
            <SchemaCard
              name="speaker"
              desc="Core identity document. Created on first OAuth sign-in. Also serves as the user account for auth."
              fields={[
                ['name', 'Display name (required)'],
                ['title', 'Job title / company'],
                ['slug', 'Auto-generated URL identifier (max 96 chars)'],
                ['email', 'Login email from OAuth (admin-only visible)'],
                [
                  'providers[]',
                  'Linked OAuth providers ("github:id", "linkedin:id")',
                ],
                ['imageURL', 'Profile image URL from OAuth provider'],
                ['image', 'Manually uploaded image (overrides imageURL)'],
                ['links[]', 'Social media / website URLs'],
                ['bio', 'Speaker biography (public profile)'],
                ['isOrganizer', 'Grants admin interface access'],
                ['flags[]', 'local, first-time, diverse, requires-funding'],
                [
                  'consent',
                  'GDPR: dataProcessing, marketing, publicProfile, photography',
                ],
              ]}
            />

            <SchemaCard
              name="speakerBadge"
              desc="OpenBadges v3.0 digital credential. JWT-signed with Ed25519 keys. Types: speaker or organizer."
              fields={[
                ['badgeId', 'Unique badge identifier'],
                ['speaker', 'Reference to speaker'],
                ['conference', 'Reference to conference'],
                ['badgeType', '"speaker" or "organizer"'],
                ['issuedAt', 'Issue timestamp'],
                ['badgeJson', 'OpenBadges v3.0 JSON-LD / JWT credential'],
                ['bakedSvg', 'SVG with embedded badge metadata'],
                ['verificationUrl', 'Public verification endpoint'],
                [
                  'emailSent / emailSentAt / emailId / emailError',
                  'Email notification tracking',
                ],
              ]}
            />

            <SchemaCard
              name="travelSupport"
              desc="Travel support request. Gated by requires-funding flag. Tracks banking details and expenses."
              fields={[
                ['speaker / conference', 'Owner references'],
                ['status', 'draft → submitted → approved/rejected → paid'],
                [
                  'bankingDetails',
                  'beneficiaryName, bankName, iban, accountNumber, swiftCode, country, preferredCurrency',
                ],
                ['totalAmount / approvedAmount', 'Expense totals'],
                [
                  'reviewedBy / reviewedAt / reviewNotes',
                  'Admin review audit trail',
                ],
                ['expectedPaymentDate / paidAt', 'Payment tracking'],
              ]}
            />

            <SchemaCard
              name="travelExpense"
              desc="Individual expense line item within a travel support request."
              fields={[
                ['travelSupport', 'Reference to parent request'],
                [
                  'category',
                  'accommodation, transportation, meals, visa, other',
                ],
                [
                  'amount / currency',
                  'Expense amount with currency (default NOK)',
                ],
                ['expenseDate / location', 'When and where'],
                [
                  'receipts[]',
                  'File uploads (PDF/JPG/PNG) with filename and timestamp',
                ],
                ['status', 'pending → approved/rejected (per-expense)'],
              ]}
            />
          </div>
        </section>

        {/* Authentication */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            Authentication
          </h2>
          <p className="font-inter mb-6 text-brand-slate-gray dark:text-gray-300">
            Speaker IS the identity model. NextAuth.js 5.0 with JWT strategy.
            OAuth sign-in triggers{' '}
            <code className="rounded bg-gray-100 px-1 text-xs dark:bg-gray-700">
              getOrCreateSpeaker()
            </code>{' '}
            which resolves or creates the speaker document.
          </p>

          <div className="mb-8 rounded-lg border border-brand-frosted-steel bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-fresh-green dark:text-green-400">
              Identity Resolution Flow
            </h3>
            <div className="space-y-3">
              <StepCard
                num={1}
                title="Find by provider"
                desc='Query speakers by providers[] array containing "github:123456"'
              />
              <StepCard
                num={2}
                title="Find by email"
                desc="If no provider match, look up by email address"
              />
              <StepCard
                num={3}
                title="Link provider"
                desc="If found by email, append new provider to existing speaker"
              />
              <StepCard
                num={4}
                title="Create new"
                desc="No match → create speaker with UUID, name, email, imageURL, providers, auto-slug"
              />
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-fresh-green dark:text-green-400">
                JWT Session
              </h3>
              <ul className="font-inter space-y-2 text-sm text-brand-slate-gray dark:text-gray-400">
                <li>
                  • <strong>Providers:</strong> GitHub, LinkedIn
                </li>
                <li>
                  • Token stores: speaker._id, name, email, image, isOrganizer,
                  flags
                </li>
                <li>
                  • Session exposes{' '}
                  <code className="text-xs">session.speaker</code> and{' '}
                  <code className="text-xs">session.account</code>
                </li>
                <li>
                  • Legacy <code className="text-xs">is_organizer</code> →{' '}
                  <code className="text-xs">isOrganizer</code> auto-migration
                </li>
              </ul>
            </div>
            <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-fresh-green dark:text-green-400">
                Access Control
              </h3>
              <ul className="font-inter space-y-2 text-sm text-brand-slate-gray dark:text-gray-400">
                <li>
                  • <code className="text-xs">isOrganizer: true</code> = admin
                  access
                </li>
                <li>• Admin routes protected by middleware checking session</li>
                <li>
                  • tRPC procedures use{' '}
                  <code className="text-xs">protectedProcedure</code> and{' '}
                  <code className="text-xs">adminProcedure</code>
                </li>
                <li>
                  • Dev-only impersonation via{' '}
                  <code className="text-xs">?impersonate=speakerId</code>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Flag System */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            Flag System
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <FlagCard
              flag="local"
              label="Local Speaker"
              desc="Speaker from the local community. Used for diversity metrics and admin filtering."
              color="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
            />
            <FlagCard
              flag="first-time"
              label="First-Time Speaker"
              desc="First conference talk. Highlighted for mentoring opportunities."
              color="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
            />
            <FlagCard
              flag="diverse"
              label="Diverse Speaker"
              desc="Underrepresented speaker. Dashboard tracks diversity metrics."
              color="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
            />
            <FlagCard
              flag="requires-funding"
              label="Requires Travel Funding"
              desc="Gates travel support eligibility. Speaker can submit expense claims."
              color="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
            />
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
                Public
              </h3>
              <div className="space-y-2">
                <RouteCard
                  path="/speaker"
                  label="Speaker listing — confirmed speakers grid"
                />
                <RouteCard
                  path="/speaker/[slug]"
                  label="Profile — bio, talks, gallery, social links, Bluesky feed"
                />
                <RouteCard
                  path="/speaker/[slug]/opengraph-image"
                  label="Dynamic OG image generation"
                />
              </div>
            </div>
            <div>
              <h3 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-slate-gray dark:text-gray-200">
                Admin
              </h3>
              <div className="space-y-2">
                <RouteCard
                  path="/admin/speakers"
                  label="Speaker table with filters, stats, create/edit/email modals"
                />
                <RouteCard
                  path="/admin/speakers/badge"
                  label="OpenBadges management — issue/manage digital credentials"
                />
                <RouteCard
                  path="/admin/speakers/travel-support"
                  label="Travel support admin — review claims, approve/reject"
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
          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-jetbrains mb-3 text-sm font-semibold text-brand-nordic-purple dark:text-purple-400">
                speakerRouter
              </h3>
              <ul className="font-inter space-y-1 text-xs text-brand-slate-gray dark:text-gray-400">
                <li>
                  <code>getCurrent</code> — own profile
                </li>
                <li>
                  <code>update</code> — edit own profile
                </li>
                <li>
                  <code>getEmails</code> — OAuth provider emails
                </li>
                <li>
                  <code>updateEmail</code> — change own email
                </li>
                <li>
                  <code>search</code> — admin: search all
                </li>
                <li>
                  <code>admin.create</code> — create speaker
                </li>
                <li>
                  <code>admin.update</code> — edit any
                </li>
                <li>
                  <code>admin.delete</code> — delete speaker
                </li>
                <li>
                  <code>admin.updateEmail</code> — change any email
                </li>
              </ul>
            </div>
            <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-jetbrains mb-3 text-sm font-semibold text-brand-nordic-purple dark:text-purple-400">
                badgeRouter
              </h3>
              <ul className="font-inter space-y-1 text-xs text-brand-slate-gray dark:text-gray-400">
                <li>
                  <code>issue</code> — issue single badge
                </li>
                <li>
                  <code>bulkIssue</code> — batch issue
                </li>
                <li>
                  <code>list</code> — by conference/speaker
                </li>
                <li>
                  <code>getById</code> — single badge
                </li>
                <li>
                  <code>resendEmail</code> — resend notification
                </li>
                <li>
                  <code>verify</code> — public: verify signature
                </li>
                <li>
                  <code>delete</code> — dev-only
                </li>
              </ul>
            </div>
            <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-jetbrains mb-3 text-sm font-semibold text-brand-nordic-purple dark:text-purple-400">
                travelSupportRouter
              </h3>
              <ul className="font-inter space-y-1 text-xs text-brand-slate-gray dark:text-gray-400">
                <li>
                  <code>getMine</code> — own request
                </li>
                <li>
                  <code>create</code> — submit request
                </li>
                <li>
                  <code>updateBankingDetails</code>
                </li>
                <li>
                  <code>submit</code> — submit for review
                </li>
                <li>
                  <code>addExpense / updateExpense</code>
                </li>
                <li>
                  <code>deleteExpense / deleteReceipt</code>
                </li>
                <li>
                  <code>list</code> — admin: all requests
                </li>
                <li>
                  <code>updateStatus</code> — approve/reject/pay
                </li>
                <li>
                  <code>updateExpenseStatus</code>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* GDPR */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            GDPR Consent
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <ConsentCard
              type="dataProcessing"
              desc="Core consent for storing personal data. Tracks IP address for audit."
            />
            <ConsentCard
              type="marketing"
              desc="Email communications. Tracks withdrawn timestamp."
            />
            <ConsentCard
              type="publicProfile"
              desc="Display speaker info on public website."
            />
            <ConsentCard type="photography" desc="Event photography consent." />
          </div>
          <p className="font-inter mt-4 text-xs text-brand-slate-gray dark:text-gray-400">
            Each consent tracks <code className="text-xs">granted</code>,{' '}
            <code className="text-xs">grantedAt</code>, and{' '}
            <code className="text-xs">privacyPolicyVersion</code>. Consent
            fields are hidden from non-admin Sanity Studio users.
          </p>
        </section>

        {/* Data Flow */}
        <section>
          <h2 className="font-space-grotesk mb-6 text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            Data Flow
          </h2>
          <div className="rounded-lg border border-brand-frosted-steel bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
            <pre className="font-jetbrains overflow-x-auto text-sm text-brand-slate-gray dark:text-gray-300">
              {`OAuth Sign-In
  → NextAuth callback → getOrCreateSpeaker()
  → Resolve by provider → email → create new
  → JWT token with speaker._id, isOrganizer, flags

Public Profile
  → /speaker/[slug] → GROQ query with conference filter
  → Cached: cacheLife('hours'), cacheTag('content:speakers')
  → Talks, gallery, social links, Bluesky feed

Admin Management
  → /admin/speakers → SpeakersPageClient
  → tRPC speaker.admin.* → Sanity CRUD
  → SpeakerTable (filters/search) + modals (create/edit/email)

Badges
  → /admin/speakers/badge → badgeRouter.issue
  → Ed25519 JWT signing → SVG baking → email via Resend
  → /badge/{badgeId} → public verification

Travel Support
  → Speaker: create → add expenses + receipts → submit
  → Admin: review → approve/reject → mark paid
  → Ownership verified on all speaker mutations`}
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

function StepCard({
  num,
  title,
  desc,
}: {
  num: number
  title: string
  desc: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-cloud-blue text-sm font-bold text-white">
        {num}
      </div>
      <div>
        <p className="font-space-grotesk text-sm font-semibold text-brand-slate-gray dark:text-gray-200">
          {title}
        </p>
        <p className="font-inter text-xs text-brand-slate-gray dark:text-gray-400">
          {desc}
        </p>
      </div>
    </div>
  )
}

function FlagCard({
  flag,
  label,
  desc,
  color,
}: {
  flag: string
  label: string
  desc: string
  color: string
}) {
  return (
    <div className="rounded-lg border border-brand-frosted-steel bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-2 flex items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${color}`}>
          {flag}
        </span>
        <span className="font-space-grotesk text-sm font-semibold text-brand-slate-gray dark:text-gray-200">
          {label}
        </span>
      </div>
      <p className="font-inter text-xs text-brand-slate-gray dark:text-gray-400">
        {desc}
      </p>
    </div>
  )
}

function ConsentCard({ type, desc }: { type: string; desc: string }) {
  return (
    <div className="rounded-lg border border-brand-frosted-steel bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <code className="font-jetbrains text-sm text-brand-nordic-purple dark:text-purple-400">
        {type}
      </code>
      <p className="font-inter mt-1 text-xs text-brand-slate-gray dark:text-gray-400">
        {desc}
      </p>
    </div>
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
