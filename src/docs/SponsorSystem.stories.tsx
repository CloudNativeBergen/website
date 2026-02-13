import type { Meta, StoryObj } from '@storybook/nextjs-vite'

const meta = {
  title: 'Systems/Sponsors',
  tags: ['autodocs'],
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
          Sponsor System
        </h1>
        <p className="font-inter mb-12 text-lg text-brand-slate-gray dark:text-gray-300">
          Manages the full lifecycle of conference sponsorships — from initial
          prospecting through contract generation, digital signatures,
          invoicing, and self-service onboarding. Built on a two-document model
          separating the conference-independent sponsor entity from
          per-conference CRM records.
        </p>

        {/* Data Model */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            Data Model
          </h2>
          <div className="space-y-6">
            <SchemaCard
              name="sponsor"
              desc="Base company record. Conference-independent. Referenced by sponsorForConference."
              fields={[
                ['name', 'Company name (required)'],
                ['website', 'Company URL (required)'],
                ['logo', 'Inline SVG logo'],
                ['logoBright', 'Bright variant for dark backgrounds'],
                ['orgNumber', 'Company registration number (admin-only)'],
                [
                  'address',
                  'Registered address, used in contracts (admin-only)',
                ],
              ]}
            />

            <SchemaCard
              name="sponsorTier"
              desc="Defines sponsorship levels and pricing. Per-conference. Three tier types."
              fields={[
                ['title / tagline', 'Tier name and description (required)'],
                ['tierType', 'standard, special, or addon (required)'],
                ['price[]', 'Amount + currency pairs (required for standard)'],
                [
                  'perks[]',
                  'Label + description pairs (required for standard)',
                ],
                ['conference', 'Reference to conference (required)'],
                [
                  'maxQuantity',
                  'Max sponsors (1 = exclusive, empty = unlimited)',
                ],
                ['soldOut / mostPopular', 'Display flags'],
              ]}
            />

            <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-jetbrains mb-3 text-lg font-semibold text-brand-nordic-purple dark:text-purple-400">
                sponsorForConference
              </h3>
              <p className="font-inter mb-4 text-sm text-brand-slate-gray dark:text-gray-300">
                CRM join document linking sponsors to conferences. 29 fields
                across 7 categories.
              </p>

              <FieldGroup
                label="Core References"
                fields={[
                  ['sponsor / conference', 'Required references'],
                  ['tier', 'Reference to sponsorTier'],
                  ['addons[]', 'Additional addon tiers'],
                ]}
              />
              <FieldGroup
                label="Pipeline &amp; Status"
                fields={[
                  [
                    'status',
                    'prospect → contacted → negotiating → closed-won / closed-lost',
                  ],
                  [
                    'invoiceStatus',
                    'not-sent → sent → paid / overdue / cancelled',
                  ],
                  [
                    'invoiceSentAt / invoicePaidAt',
                    'Auto-populated timestamps',
                  ],
                ]}
              />
              <FieldGroup
                label="Contract"
                fields={[
                  [
                    'contractStatus',
                    'none → verbal-agreement → contract-sent → contract-signed',
                  ],
                  [
                    'signatureStatus',
                    'not-started → pending → signed / rejected / expired',
                  ],
                  ['signatureId / signerEmail', 'External e-signing tracking'],
                  ['contractSentAt / contractSignedAt', 'Timestamps'],
                  ['contractDocument', 'Generated PDF file'],
                  ['contractTemplate', 'Reference to contractTemplate'],
                  ['reminderCount', 'Signature reminders sent'],
                ]}
              />
              <FieldGroup
                label="Financial"
                fields={[
                  ['contractValue', 'Defaults to tier price'],
                  ['contractCurrency', 'NOK, USD, EUR, GBP, SEK, DKK, OTHER'],
                ]}
              />
              <FieldGroup
                label="Contacts &amp; Billing"
                fields={[
                  [
                    'contactPersons[]',
                    'name, email, phone, role, isPrimary (admin-only)',
                  ],
                  ['billing', 'email, reference, comments (admin-only)'],
                ]}
              />
              <FieldGroup
                label="Assignment &amp; Meta"
                fields={[
                  ['assignedTo', 'Reference to organizer speaker'],
                  ['notes', 'Internal notes'],
                  [
                    'tags[]',
                    'warm-lead, returning-sponsor, cold-outreach, referral, high-priority, needs-follow-up, multi-year-potential, previously-declined',
                  ],
                  ['contactInitiatedAt', 'First contact timestamp'],
                ]}
              />
              <FieldGroup
                label="Onboarding"
                fields={[
                  ['onboardingToken', 'Unique token for self-service portal'],
                  [
                    'onboardingComplete / onboardingCompletedAt',
                    'Completion tracking',
                  ],
                ]}
              />
            </div>

            <SchemaCard
              name="contractTemplate"
              desc="Template for contract PDF generation. Supports {{{VARIABLE}}} syntax."
              fields={[
                ['title / conference', 'Name and conference (required)'],
                ['tier', 'Optional tier association'],
                ['language', '"nb" or "en"'],
                ['currency', 'Default currency for contract'],
                [
                  'sections[]',
                  'heading + body (blockContent) pairs (required)',
                ],
                ['headerText / footerText', 'PDF header/footer text'],
                ['terms', 'General T&Cs (shown on /sponsor/terms)'],
                ['isDefault / isActive', 'Template selection flags'],
              ]}
            />

            <SchemaCard
              name="sponsorEmailTemplate"
              desc="Reusable email templates with variable substitution."
              fields={[
                ['title / slug', 'Name and identifier (required)'],
                [
                  'category',
                  'cold-outreach, returning-sponsor, international, local-community, follow-up, custom',
                ],
                ['language', '"no" or "en"'],
                ['subject / body', 'Email content with {{{VARIABLE}}} support'],
                ['isDefault / sortOrder', 'Display ordering'],
              ]}
            />

            <SchemaCard
              name="sponsorActivity"
              desc="Audit log for CRM actions. Tracks stage changes, emails, meetings, and more."
              fields={[
                ['sponsorForConference', 'Reference (required)'],
                [
                  'activityType',
                  'stage_change, invoice_status_change, contract_status_change, contract_signed, note, email, call, meeting',
                ],
                ['description', 'Activity description (required)'],
                ['metadata', 'oldValue, newValue, timestamp, additionalData'],
                ['createdBy / createdAt', 'Author and timestamp'],
              ]}
            />
          </div>
        </section>

        {/* Workflows */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            Workflows
          </h2>

          <div className="mb-8">
            <h3 className="font-space-grotesk mb-4 text-xl font-semibold text-brand-slate-gray dark:text-gray-200">
              Pipeline
            </h3>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <StatusBadge label="Prospect" color="bg-gray-200 text-gray-700" />
              <Arrow />
              <StatusBadge
                label="Contacted"
                color="bg-blue-100 text-blue-700"
              />
              <Arrow />
              <StatusBadge
                label="Negotiating"
                color="bg-amber-100 text-amber-700"
              />
              <Arrow />
              <StatusBadge
                label="Closed Won"
                color="bg-green-100 text-green-700"
              />
            </div>
            <p className="mt-2 text-center text-xs text-gray-400">
              <span className="rounded bg-red-50 px-2 py-0.5 text-red-500">
                Closed Lost
              </span>{' '}
              can be reached from any stage
            </p>
          </div>

          <div className="mb-8">
            <h3 className="font-space-grotesk mb-4 text-xl font-semibold text-brand-slate-gray dark:text-gray-200">
              Contract Status
            </h3>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <StatusBadge label="None" color="bg-gray-200 text-gray-700" />
              <Arrow />
              <StatusBadge
                label="Verbal Agreement"
                color="bg-blue-100 text-blue-700"
              />
              <Arrow />
              <StatusBadge
                label="Contract Sent"
                color="bg-amber-100 text-amber-700"
              />
              <Arrow />
              <StatusBadge
                label="Contract Signed"
                color="bg-green-100 text-green-700"
              />
            </div>
          </div>

          <div className="mb-8">
            <h3 className="font-space-grotesk mb-4 text-xl font-semibold text-brand-slate-gray dark:text-gray-200">
              Signature Status
            </h3>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <StatusBadge
                label="Not Started"
                color="bg-gray-200 text-gray-700"
              />
              <Arrow />
              <StatusBadge
                label="Pending"
                color="bg-amber-100 text-amber-700"
              />
              <Arrow />
              <StatusBadge label="Signed" color="bg-green-100 text-green-700" />
            </div>
            <div className="mt-2 flex justify-center gap-3 text-xs text-gray-500">
              <span className="rounded bg-red-50 px-2 py-0.5 text-red-500">
                Rejected
              </span>
              <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-500">
                Expired
              </span>
            </div>
            <p className="font-inter mt-3 text-center text-xs text-brand-slate-gray dark:text-gray-400">
              When signature becomes{' '}
              <strong className="text-green-600">Signed</strong>, contractStatus
              is atomically set to <strong>Contract Signed</strong>.
            </p>
          </div>

          <div>
            <h3 className="font-space-grotesk mb-4 text-xl font-semibold text-brand-slate-gray dark:text-gray-200">
              Invoice Status
            </h3>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <StatusBadge label="Not Sent" color="bg-gray-200 text-gray-700" />
              <Arrow />
              <StatusBadge label="Sent" color="bg-blue-100 text-blue-700" />
              <Arrow />
              <StatusBadge label="Paid" color="bg-green-100 text-green-700" />
            </div>
            <div className="mt-2 flex justify-center gap-3 text-xs text-gray-500">
              <span className="rounded bg-red-50 px-2 py-0.5 text-red-500">
                Overdue
              </span>
              <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-500">
                Cancelled
              </span>
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
                Public
              </h3>
              <div className="space-y-2">
                <RouteCard path="/sponsor" label="Sponsor listing page" />
                <RouteCard
                  path="/sponsor/terms"
                  label="Sponsorship terms &amp; conditions"
                />
                <RouteCard
                  path="/sponsor/onboarding/[token]"
                  label="Self-service onboarding portal"
                />
              </div>
            </div>
            <div>
              <h3 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-slate-gray dark:text-gray-200">
                Admin
              </h3>
              <div className="space-y-2">
                <RouteCard
                  path="/admin/sponsors"
                  label="Dashboard with metrics and action items"
                />
                <RouteCard
                  path="/admin/sponsors/crm"
                  label="CRM pipeline board (Kanban)"
                />
                <RouteCard
                  path="/admin/sponsors/contacts"
                  label="Contact persons management"
                />
                <RouteCard
                  path="/admin/sponsors/activity"
                  label="Activity audit log"
                />
                <RouteCard
                  path="/admin/sponsors/tiers"
                  label="Tier management"
                />
                <RouteCard
                  path="/admin/sponsors/contracts[/new|/id]"
                  label="Contract template CRUD"
                />
                <RouteCard
                  path="/admin/sponsors/templates[/new|/id]"
                  label="Email template CRUD"
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
          <p className="font-inter mb-6 text-sm text-brand-slate-gray dark:text-gray-300">
            38 procedures across 5 sub-routers. All admin-protected.
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            <ProcedureCard
              name="sponsor.*"
              label="Sponsor CRUD"
              procedures={[
                'list — search sponsors',
                'getById — single sponsor',
                'create / update / delete',
              ]}
            />
            <ProcedureCard
              name="sponsor.tiers.*"
              label="Tier CRUD"
              procedures={[
                'list / listByConference',
                'getById',
                'create / update / delete',
              ]}
            />
            <ProcedureCard
              name="sponsor.crm.*"
              label="CRM Pipeline (14 procedures)"
              procedures={[
                'list — filtered by status, invoice, tags, tiers, assignee',
                'getById / create / update / delete',
                'moveStage — pipeline transitions + activity log',
                'updateContractStatus / updateSignatureStatus',
                'updateInvoiceStatus — auto-sets timestamps',
                'bulkUpdate / bulkDelete',
                'copyFromPreviousYear / importAllHistoric',
                'listOrganizers',
                'activities.list — audit log',
              ]}
            />
            <ProcedureCard
              name="sponsor.emailTemplates.*"
              label="Email Templates"
              procedures={[
                'list / get / create / update / delete',
                'setDefault / reorder',
              ]}
            />
            <ProcedureCard
              name="sponsor.contractTemplates.*"
              label="Contract Templates"
              procedures={[
                'list / get / create / update / delete',
                'findBest — match by conference, tier, language',
                'contractReadiness — check required data',
                'generatePdf — render template to PDF',
              ]}
            />
          </div>
        </section>

        {/* Email System */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            Email System
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <RouteCard
              path="/admin/api/sponsors/email/send"
              label="Individual email to sponsor contact"
            />
            <RouteCard
              path="/admin/api/sponsors/email/broadcast"
              label="Broadcast email to multiple sponsors"
            />
            <RouteCard
              path="/admin/api/sponsors/email/discount"
              label="Discount code email to sponsor contacts"
            />
            <RouteCard
              path="/admin/api/sponsors/email/audience/sync"
              label="Sync sponsor contacts with Resend audience"
            />
          </div>
        </section>

        {/* Data Flow */}
        <section>
          <h2 className="font-space-grotesk mb-6 text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            Data Flow
          </h2>
          <div className="rounded-lg border border-brand-frosted-steel bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
            <pre className="font-jetbrains overflow-x-auto text-sm text-brand-slate-gray dark:text-gray-300">
              {`Sponsor onboarding
  → CRM: create sponsorForConference (auto-assign to current user)
  → Pipeline: prospect → contacted → negotiating → closed-won
  → Each stage change logged to sponsorActivity

Contract flow
  → contractTemplates.findBest → match tier + language
  → contractTemplates.generatePdf → render with {{{VARIABLE}}} substitution
  → crm.updateContractStatus → contract-sent
  → crm.updateSignatureStatus → pending → signed
  → Signed atomically sets contractStatus → contract-signed + timestamp

Invoicing
  → crm.updateInvoiceStatus → sent (auto-sets invoiceSentAt)
  → paid (auto-sets invoicePaidAt) | overdue | cancelled

Self-service onboarding
  → /sponsor/onboarding/[token] → logo upload, billing, contacts
  → Sets onboardingComplete + onboardingCompletedAt`}
            </pre>
          </div>
        </section>
      </div>
    </div>
  ),
}

export const WorkflowDiagram: Story = {
  render: () => (
    <div className="min-h-screen bg-white p-8 dark:bg-gray-900">
      <div className="mx-auto max-w-4xl">
        <h1 className="font-space-grotesk mb-8 text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
          Sponsor Workflow
        </h1>

        {/* Pipeline Flow */}
        <div className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-gray-200">
            Pipeline Flow
          </h2>
          <div className="flex items-center justify-between">
            <WorkflowStep num="1" label="Prospect" />
            <div className="h-1 flex-1 bg-brand-frosted-steel dark:bg-gray-700" />
            <WorkflowStep num="2" label="Contacted" />
            <div className="h-1 flex-1 bg-brand-frosted-steel dark:bg-gray-700" />
            <WorkflowStep num="3" label="Negotiating" />
            <div className="h-1 flex-1 bg-brand-frosted-steel dark:bg-gray-700" />
            <WorkflowStep num="✓" label="Closed Won" done />
          </div>
        </div>

        {/* Contract Workflow */}
        <div className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-gray-200">
            Contract Workflow
          </h2>
          <div className="space-y-4">
            <WorkflowRow num={1} title="None" desc="No contract discussion" />
            <WorkflowRow
              num={2}
              title="Verbal Agreement"
              desc="Terms agreed verbally"
            />
            <WorkflowRow
              num={3}
              title="Contract Sent"
              desc="PDF generated and sent for signing"
            />
            <WorkflowRow
              num="✓"
              title="Contract Signed"
              desc="Digitally signed and executed"
              done
            />
          </div>
        </div>

        {/* Signature Workflow */}
        <div className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-gray-200">
            Signature Workflow
          </h2>
          <div className="space-y-4">
            <WorkflowRow
              num={1}
              title="Not Started"
              desc="Contract not yet sent for e-signing"
            />
            <WorkflowRow
              num={2}
              title="Pending"
              desc="Awaiting signer response"
            />
            <WorkflowRow
              num="✓"
              title="Signed"
              desc="Atomically sets contractStatus → contract-signed"
              done
            />
          </div>
          <div className="mt-4 flex gap-4">
            <div className="flex-1 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/30 dark:bg-red-900/10">
              <p className="font-space-grotesk text-sm font-semibold text-red-600 dark:text-red-400">
                Rejected
              </p>
              <p className="font-inter text-xs text-brand-slate-gray dark:text-gray-400">
                Signer declined the contract
              </p>
            </div>
            <div className="flex-1 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
              <p className="font-space-grotesk text-sm font-semibold text-gray-500">
                Expired
              </p>
              <p className="font-inter text-xs text-brand-slate-gray dark:text-gray-400">
                Signature request timed out
              </p>
            </div>
          </div>
        </div>

        {/* Invoice Workflow */}
        <div>
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-gray-200">
            Invoice Workflow
          </h2>
          <div className="space-y-4">
            <WorkflowRow
              num={1}
              title="Not Sent"
              desc="Invoice not yet created"
            />
            <WorkflowRow
              num={2}
              title="Sent"
              desc="Auto-populates invoiceSentAt"
            />
            <WorkflowRow
              num="✓"
              title="Paid"
              desc="Auto-populates invoicePaidAt"
              done
            />
          </div>
          <div className="mt-4 flex gap-4">
            <div className="flex-1 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/30 dark:bg-red-900/10">
              <p className="font-space-grotesk text-sm font-semibold text-red-600 dark:text-red-400">
                Overdue
              </p>
              <p className="font-inter text-xs text-brand-slate-gray dark:text-gray-400">
                Payment past due date
              </p>
            </div>
            <div className="flex-1 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
              <p className="font-space-grotesk text-sm font-semibold text-gray-500">
                Cancelled
              </p>
              <p className="font-inter text-xs text-brand-slate-gray dark:text-gray-400">
                Invoice voided
              </p>
            </div>
          </div>
        </div>
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
          <Field key={fieldName} name={fieldName} desc={fieldDesc} />
        ))}
      </div>
    </div>
  )
}

function FieldGroup({
  label,
  fields,
}: {
  label: string
  fields: [string, string][]
}) {
  return (
    <div className="mb-4">
      <h4 className="font-space-grotesk mb-2 text-sm font-semibold text-brand-slate-gray dark:text-gray-200">
        {label}
      </h4>
      <div className="grid gap-2 md:grid-cols-2">
        {fields.map(([fieldName, fieldDesc]) => (
          <Field key={fieldName} name={fieldName} desc={fieldDesc} />
        ))}
      </div>
    </div>
  )
}

function Field({ name, desc }: { name: string; desc: string }) {
  return (
    <div>
      <code className="font-jetbrains text-xs text-brand-cloud-blue dark:text-blue-400">
        {name}
      </code>
      <p className="font-inter text-xs text-brand-slate-gray dark:text-gray-400">
        {desc}
      </p>
    </div>
  )
}

function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className={`font-inter rounded-full px-3 py-1.5 text-sm font-semibold ${color}`}
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

function ProcedureCard({
  name,
  label,
  procedures,
}: {
  name: string
  label: string
  procedures: string[]
}) {
  return (
    <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
      <h3 className="font-jetbrains mb-1 text-sm font-semibold text-brand-nordic-purple dark:text-purple-400">
        {name}
      </h3>
      <p className="font-inter mb-3 text-xs text-brand-slate-gray dark:text-gray-400">
        {label}
      </p>
      <ul className="font-inter space-y-1 text-xs text-brand-slate-gray dark:text-gray-400">
        {procedures.map((p) => (
          <li key={p}>
            <code className="text-xs">{p}</code>
          </li>
        ))}
      </ul>
    </div>
  )
}

function WorkflowStep({
  num,
  label,
  done,
}: {
  num: string
  label: string
  done?: boolean
}) {
  return (
    <div className="text-center">
      <div
        className={`mb-2 flex h-16 w-16 items-center justify-center rounded-full ${done ? 'bg-brand-fresh-green/20 dark:bg-green-900/30' : 'bg-brand-sky-mist dark:bg-blue-900/30'}`}
      >
        <span
          className={`font-jetbrains text-2xl ${done ? 'text-brand-fresh-green dark:text-green-400' : 'text-brand-cloud-blue dark:text-blue-400'}`}
        >
          {num}
        </span>
      </div>
      <p
        className={`font-inter text-sm ${done ? 'text-brand-fresh-green dark:text-green-400' : 'text-brand-slate-gray dark:text-gray-300'}`}
      >
        {label}
      </p>
    </div>
  )
}

function WorkflowRow({
  num,
  title,
  desc,
  done,
}: {
  num: number | string
  title: string
  desc: string
  done?: boolean
}) {
  return (
    <div
      className={`flex items-center gap-4 rounded-lg border p-4 ${done
          ? 'border-brand-fresh-green/20 bg-brand-fresh-green/10 dark:border-green-500/20 dark:bg-green-900/20'
          : 'border-brand-frosted-steel bg-brand-sky-mist dark:border-gray-700 dark:bg-gray-800'
        }`}
    >
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-full text-white ${done ? 'bg-brand-fresh-green' : 'bg-brand-cloud-blue'}`}
      >
        {num}
      </div>
      <div className="flex-1">
        <h3
          className={`font-space-grotesk font-semibold ${done ? 'text-brand-fresh-green dark:text-green-400' : 'text-brand-slate-gray dark:text-white'}`}
        >
          {title}
        </h3>
        <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-400">
          {desc}
        </p>
      </div>
    </div>
  )
}
