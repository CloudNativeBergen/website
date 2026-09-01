'use client'

// PROTOTYPE — throwaway UI exploration for the Marketing Plan admin feature
// (wayfinder ticket #936, map #929). Three structurally different takes on
// plan overview / campaign view / task editor / measurement, mounted on the
// real /admin/marketing route behind ?variant=A|B|C. No param = the existing
// promo studio, so the variants are judged against the page they replace.
// All state is in memory; every action is a stub. Delete this directory once
// a winner is folded into the real implementation.

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowTopRightOnSquareIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardDocumentIcon,
  CursorArrowRaysIcon,
  DocumentDuplicateIcon,
  FlagIcon,
  LinkIcon,
  MegaphoneIcon,
  PhotoIcon,
  PlusIcon,
  SparklesIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline'
import { AdminPageHeader } from '@/components/admin'

// ---------------------------------------------------------------------------
// Mock domain data. Vocabulary from CONTEXT.md: Marketing Plan → Campaign →
// Task, each Task on a Channel. Milestones come from the real conference.
// ---------------------------------------------------------------------------

export type Channel = 'linkedin' | 'bluesky'

type TaskStatus =
  | 'planned' // content not written yet
  | 'ready' // content written, waiting for its date
  | 'due' // date reached, needs approve (Bluesky) or manual post (LinkedIn)
  | 'published'
  | 'skipped'

interface ChannelMeta {
  key: Channel
  label: string
  short: string
  integrated: boolean
  maxChars: number
  dot: string
}

const CHANNELS: Record<Channel, ChannelMeta> = {
  linkedin: {
    key: 'linkedin',
    label: 'LinkedIn',
    short: 'in',
    integrated: false,
    maxChars: 3000,
    dot: 'bg-sky-700',
  },
  bluesky: {
    key: 'bluesky',
    label: 'Bluesky',
    short: 'bsky',
    integrated: true,
    maxChars: 300,
    dot: 'bg-blue-500',
  },
}

export interface Milestone {
  key: string
  label: string
  date: string | null // ISO date; null = not set on the conference
  inSchema: boolean
}

interface Task {
  id: string
  campaignId: string
  title: string
  channel: Channel
  date: string // ISO date
  owner: string
  status: TaskStatus
  body: string
  link: string
  asset?: string
  metrics?: {
    clicks: number
    ctaEvents: number
    likes?: number
    reposts?: number
  }
  externalPostUrl?: string
}

type Outcome = 'cfp-submissions' | 'ticket-checkout' | 'program-visits'

interface Campaign {
  id: string
  name: string
  outcome: Outcome
  outcomeLabel: string
  anchor: string // milestone key
  from: string
  to: string
  color: string
}

const OUTCOME_LABEL: Record<Outcome, string> = {
  'cfp-submissions': 'CFP submissions',
  'ticket-checkout': 'Checkout click-throughs',
  'program-visits': 'Program page visits',
}

const CAMPAIGNS: Campaign[] = [
  {
    id: 'cfp',
    name: 'CFP open',
    outcome: 'cfp-submissions',
    outcomeLabel: OUTCOME_LABEL['cfp-submissions'],
    anchor: 'cfpEndDate',
    from: '2026-03-02',
    to: '2026-04-30',
    color: 'bg-emerald-500',
  },
  {
    id: 'early',
    name: 'Early-bird tickets',
    outcome: 'ticket-checkout',
    outcomeLabel: OUTCOME_LABEL['ticket-checkout'],
    anchor: 'earlyBirdEnd',
    from: '2026-06-01',
    to: '2026-08-31',
    color: 'bg-amber-500',
  },
  {
    id: 'speakers',
    name: 'Speaker announcements',
    outcome: 'ticket-checkout',
    outcomeLabel: OUTCOME_LABEL['ticket-checkout'],
    anchor: 'programDate',
    from: '2026-08-10',
    to: '2026-10-05',
    color: 'bg-indigo-500',
  },
  {
    id: 'program',
    name: 'Program launch',
    outcome: 'program-visits',
    outcomeLabel: OUTCOME_LABEL['program-visits'],
    anchor: 'programDate',
    from: '2026-09-07',
    to: '2026-09-25',
    color: 'bg-rose-500',
  },
]

const TASKS: Task[] = [
  {
    id: 't1',
    campaignId: 'cfp',
    title: 'CFP is open',
    channel: 'linkedin',
    date: '2026-03-02',
    owner: 'Øyvind',
    status: 'published',
    body: 'The call for papers for Cloud Native Days Norway 2026 is open. We want talks from people running this stuff for real.',
    link: '/cfp',
    metrics: { clicks: 412, ctaEvents: 38 },
    externalPostUrl:
      'https://www.linkedin.com/feed/update/urn:li:share:7300000000000000001',
  },
  {
    id: 't2',
    campaignId: 'cfp',
    title: 'CFP is open',
    channel: 'bluesky',
    date: '2026-03-02',
    owner: 'Øyvind',
    status: 'published',
    body: 'CFP is open for Cloud Native Days Norway 2026. Talks, lightning talks, workshops.',
    link: '/cfp',
    metrics: { clicks: 96, ctaEvents: 9, likes: 41, reposts: 12 },
  },
  {
    id: 't3',
    campaignId: 'cfp',
    title: 'Two weeks left',
    channel: 'linkedin',
    date: '2026-04-16',
    owner: 'Hans',
    status: 'published',
    body: 'Two weeks left to submit. First-time speakers welcome, we pair you with a mentor.',
    link: '/cfp',
    metrics: { clicks: 288, ctaEvents: 44 },
    externalPostUrl:
      'https://www.linkedin.com/feed/update/urn:li:share:7300000000000000002',
  },
  {
    id: 't4',
    campaignId: 'cfp',
    title: 'Last call',
    channel: 'bluesky',
    date: '2026-04-29',
    owner: 'Hans',
    status: 'published',
    body: 'CFP closes tomorrow at midnight.',
    link: '/cfp',
    metrics: { clicks: 140, ctaEvents: 31, likes: 66, reposts: 29 },
  },
  {
    id: 't5',
    campaignId: 'early',
    title: 'Early-bird is live',
    channel: 'linkedin',
    date: '2026-06-01',
    owner: 'Øyvind',
    status: 'published',
    body: 'Early-bird tickets for Cloud Native Days Norway are live until 31 August.',
    link: '/tickets',
    metrics: { clicks: 530, ctaEvents: 121 },
    externalPostUrl:
      'https://www.linkedin.com/feed/update/urn:li:share:7300000000000000003',
  },
  {
    id: 't6',
    campaignId: 'early',
    title: 'Bring your team',
    channel: 'linkedin',
    date: '2026-08-18',
    owner: 'Øyvind',
    status: 'published',
    body: 'Team tickets: five or more and you get a shared table at the workshop day.',
    link: '/tickets',
    metrics: { clicks: 201, ctaEvents: 47 },
    externalPostUrl:
      'https://www.linkedin.com/feed/update/urn:li:share:7300000000000000004',
  },
  {
    id: 't7',
    campaignId: 'early',
    title: 'Early-bird ends Monday',
    channel: 'bluesky',
    date: '2026-08-28',
    owner: 'Hans',
    status: 'published',
    body: 'Early-bird ends Monday. After that the price goes up.',
    link: '/tickets',
    metrics: { clicks: 88, ctaEvents: 19, likes: 23, reposts: 7 },
  },
  {
    id: 't8',
    campaignId: 'early',
    title: 'Early-bird ends today',
    channel: 'linkedin',
    date: '2026-08-31',
    owner: 'Øyvind',
    status: 'due',
    body: 'Last day of early-bird pricing for Cloud Native Days Norway 2026. Grab your ticket before midnight.',
    link: '/tickets',
  },
  {
    id: 't9',
    campaignId: 'speakers',
    title: 'Keynote: platform teams that last',
    channel: 'linkedin',
    date: '2026-09-01',
    owner: 'Hans',
    status: 'due',
    body: 'Our opening keynote is set. Ten years of platform teams, what survived and what did not.',
    link: '/speaker/keynote',
    asset: 'Speaker card',
  },
  {
    id: 't10',
    campaignId: 'speakers',
    title: 'Keynote: platform teams that last',
    channel: 'bluesky',
    date: '2026-09-01',
    owner: 'Hans',
    status: 'due',
    body: 'Opening keynote announced. Ten years of platform teams.',
    link: '/speaker/keynote',
    asset: 'Speaker card',
  },
  {
    id: 't11',
    campaignId: 'speakers',
    title: 'Speaker: eBPF in production',
    channel: 'bluesky',
    date: '2026-09-03',
    owner: 'Hans',
    status: 'ready',
    body: 'eBPF in production, without the folklore.',
    link: '/speaker/ebpf',
    asset: 'Speaker card',
  },
  {
    id: 't12',
    campaignId: 'speakers',
    title: 'Speaker: eBPF in production',
    channel: 'linkedin',
    date: '2026-09-03',
    owner: 'Hans',
    status: 'planned',
    body: '',
    link: '/speaker/ebpf',
    asset: 'Speaker card',
  },
  {
    id: 't13',
    campaignId: 'speakers',
    title: 'Workshop lineup',
    channel: 'linkedin',
    date: '2026-09-10',
    owner: 'Øyvind',
    status: 'planned',
    body: '',
    link: '/program#workshops',
  },
  {
    id: 't14',
    campaignId: 'program',
    title: 'Full program is out',
    channel: 'linkedin',
    date: '2026-09-15',
    owner: 'Øyvind',
    status: 'planned',
    body: '',
    link: '/program',
    asset: 'Conference promo',
  },
  {
    id: 't15',
    campaignId: 'program',
    title: 'Full program is out',
    channel: 'bluesky',
    date: '2026-09-15',
    owner: 'Øyvind',
    status: 'planned',
    body: '',
    link: '/program',
    asset: 'Conference promo',
  },
  {
    id: 't16',
    campaignId: 'program',
    title: 'Three talks not to miss',
    channel: 'bluesky',
    date: '2026-09-22',
    owner: 'Hans',
    status: 'planned',
    body: '',
    link: '/program',
  },
]

const TODAY = '2026-09-01'

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

const statusTone: Record<TaskStatus, string> = {
  planned: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  ready: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
  due: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  published:
    'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  skipped: 'bg-gray-100 text-gray-400 line-through dark:bg-gray-800',
}

const statusLabel: Record<TaskStatus, string> = {
  planned: 'Needs content',
  ready: 'Ready',
  due: 'Due',
  published: 'Published',
  skipped: 'Skipped',
}

function utmLink(task: Task, campaign: Campaign, domain: string) {
  return `https://${domain}${task.link}?utm_source=${task.channel}&utm_medium=social&utm_campaign=${campaign.id}&utm_content=${task.id}`
}

function campaignTotals(c: Campaign) {
  const ts = TASKS.filter((t) => t.campaignId === c.id)
  const done = ts.filter((t) => t.status === 'published')
  const clicks = done.reduce((n, t) => n + (t.metrics?.clicks ?? 0), 0)
  const cta = done.reduce((n, t) => n + (t.metrics?.ctaEvents ?? 0), 0)
  return { total: ts.length, done: done.length, clicks, cta }
}

// ---------------------------------------------------------------------------
// Shared bits (kept deliberately small so variants own their layouts)
// ---------------------------------------------------------------------------

function ChannelDot({
  channel,
  className = '',
}: {
  channel: Channel
  className?: string
}) {
  const m = CHANNELS[channel]
  return (
    <span
      title={m.label}
      className={`inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-[10px] font-bold text-white ${m.dot} ${className}`}
    >
      {m.short}
    </span>
  )
}

function StatusPill({ status }: { status: TaskStatus }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusTone[status]}`}
    >
      {statusLabel[status]}
    </span>
  )
}

function PlanSourceActions() {
  return [
    {
      label: 'New plan from template',
      onClick: () => undefined,
      icon: <SparklesIcon className="h-4 w-4" />,
      variant: 'secondary' as const,
    },
    {
      label: 'Copy 2025 plan',
      onClick: () => undefined,
      icon: <DocumentDuplicateIcon className="h-4 w-4" />,
      variant: 'secondary' as const,
    },
    {
      label: 'Add campaign',
      onClick: () => undefined,
      icon: <PlusIcon className="h-4 w-4" />,
    },
  ]
}

/** The Task editor, shared in content but hosted differently per variant. */
function TaskEditor({
  task,
  domain,
  onClose,
}: {
  task: Task
  domain: string
  onClose: () => void
}) {
  const campaign = CAMPAIGNS.find((c) => c.id === task.campaignId)!
  const ch = CHANNELS[task.channel]
  const [body, setBody] = useState(task.body)
  const link = utmLink(task, campaign, domain)
  return (
    <div className="flex h-full flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase">
            {campaign.name}
          </p>
          <h3 className="font-space-grotesk text-lg font-semibold text-gray-900 dark:text-white">
            {task.title}
          </h3>
          <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
            <ChannelDot channel={task.channel} /> {ch.label} · {fmt(task.date)}{' '}
            · <UserCircleIcon className="h-4 w-4" /> {task.owner}
          </div>
        </div>
        <StatusPill status={task.status} />
      </div>

      <label className="block">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
          Post text
        </span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          placeholder={`Write the ${ch.label} post…`}
          className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-3 text-sm dark:border-gray-700 dark:bg-gray-900"
        />
        <span
          className={`text-xs ${body.length > ch.maxChars ? 'text-red-600' : 'text-gray-400'}`}
        >
          {body.length} / {ch.maxChars}
        </span>
      </label>

      <div className="rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-700">
        <div className="flex items-center gap-2 font-medium text-gray-700 dark:text-gray-200">
          <LinkIcon className="h-4 w-4" /> Tracked link
        </div>
        <p className="mt-1 truncate font-mono text-xs text-gray-500">{link}</p>
        <p className="mt-1 text-xs text-gray-400">
          Attribution is read from Pirsch by campaign and task. Always points at
          our own site.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-dashed border-gray-300 p-3 text-sm dark:border-gray-700">
        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
          <PhotoIcon className="h-4 w-4" /> {task.asset ?? 'No image'}
        </div>
        <button className="text-indigo-600 hover:underline dark:text-indigo-400">
          {task.asset ? 'Change in studio' : 'Pick from studio'}
        </button>
      </div>

      <div className="mt-auto space-y-2">
        {ch.integrated ? (
          <button className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
            {task.status === 'due'
              ? 'Approve and publish to Bluesky'
              : 'Mark ready'}
          </button>
        ) : (
          <>
            <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
              <ClipboardDocumentIcon className="h-4 w-4" /> Copy text and link,
              open LinkedIn
            </button>
            <input
              placeholder="Paste the published post URL to mark done"
              defaultValue={task.externalPostUrl}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
          </>
        )}
        <button
          onClick={onClose}
          className="w-full text-sm text-gray-500 hover:underline"
        >
          Close
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Variant A — Milestone timeline. Signature: the conference's own dates form
// the axis; campaigns are swimlanes; tasks are chips; today is a red line.
// Editor slides in from the right.
// ---------------------------------------------------------------------------

interface VariantProps {
  conferenceTitle: string
  domain: string
  milestones: Milestone[]
}

function VariantA({ conferenceTitle, domain, milestones }: VariantProps) {
  const [open, setOpen] = useState<Task | null>(null)
  const start = new Date('2026-02-15').getTime()
  const end = new Date('2026-11-15').getTime()
  const pct = (iso: string) =>
    ((new Date(iso).getTime() - start) / (end - start)) * 100
  const due = TASKS.filter((t) => t.status === 'due').length

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<MegaphoneIcon />}
        title="Marketing plan"
        description={
          <>
            Every campaign for{' '}
            <span className="font-medium text-brand-cloud-blue dark:text-blue-300">
              {conferenceTitle}
            </span>
            , laid against the conference milestones.
          </>
        }
        actionItems={PlanSourceActions()}
        stats={[
          { value: CAMPAIGNS.length, label: 'Campaigns', color: 'slate' },
          { value: due, label: 'Due now', color: 'yellow' },
          {
            value: TASKS.filter((t) => t.status === 'published').length,
            label: 'Published',
            color: 'green',
          },
          {
            value: TASKS.filter((t) => t.status === 'planned').length,
            label: 'Need content',
            color: 'red',
          },
        ]}
      />

      <div className="relative overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="min-w-[960px] p-5">
          {/* milestone axis */}
          <div className="relative h-14 border-b border-gray-200 dark:border-gray-800">
            {milestones.map((m) =>
              m.date ? (
                <div
                  key={m.key}
                  className="absolute top-0 -translate-x-1/2 text-center"
                  style={{ left: `${pct(m.date)}%` }}
                >
                  <FlagIcon
                    className={`mx-auto h-4 w-4 ${m.inSchema ? 'text-gray-500' : 'text-amber-500'}`}
                  />
                  <p className="mt-0.5 text-[11px] leading-tight font-medium text-gray-700 dark:text-gray-200">
                    {m.label}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {fmt(m.date)}
                    {m.inSchema ? '' : ' · not in schema'}
                  </p>
                </div>
              ) : null,
            )}
          </div>

          {/* lanes */}
          <div className="relative mt-3 space-y-3">
            <div
              className="absolute inset-y-0 z-10 w-px bg-red-500"
              style={{ left: `${pct(TODAY)}%` }}
            >
              <span className="absolute -top-1 -translate-x-1/2 rounded bg-red-500 px-1 text-[10px] font-semibold text-white">
                today
              </span>
            </div>
            {CAMPAIGNS.map((c) => {
              const tot = campaignTotals(c)
              return (
                <div
                  key={c.id}
                  className="relative h-16 rounded-lg bg-gray-50 dark:bg-gray-800/60"
                >
                  <div
                    className={`absolute top-2 h-1.5 rounded-full opacity-70 ${c.color}`}
                    style={{
                      left: `${pct(c.from)}%`,
                      width: `${pct(c.to) - pct(c.from)}%`,
                    }}
                  />
                  <div
                    className="absolute top-4 text-xs font-semibold text-gray-800 dark:text-gray-100"
                    style={{ left: `${pct(c.from)}%` }}
                  >
                    {c.name}
                    <span className="ml-2 font-normal text-gray-500">
                      {tot.done}/{tot.total} · {tot.clicks} clicks → {tot.cta}{' '}
                      {c.outcomeLabel.toLowerCase()}
                    </span>
                  </div>
                  {TASKS.filter((t) => t.campaignId === c.id).map((t, i) => (
                    <button
                      key={t.id}
                      onClick={() => setOpen(t)}
                      title={`${t.title} · ${CHANNELS[t.channel].label}`}
                      className={`absolute bottom-2 flex -translate-x-1/2 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] shadow-sm hover:ring-2 hover:ring-indigo-400 ${statusTone[t.status]} ${t.channel === 'bluesky' ? 'border-blue-300' : 'border-sky-800/40'}`}
                      style={{
                        left: `${pct(t.date)}%`,
                        transform: `translate(-50%, ${i % 2 ? '-22px' : '0'})`,
                      }}
                    >
                      <ChannelDot
                        channel={t.channel}
                        className="h-4 min-w-4 text-[9px]"
                      />
                      {t.status === 'due' ? '!' : ''}
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Chips are tasks. Click one to edit. Amber flags are milestones the
        built-in template needs but the conference schema does not have yet.
      </p>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => setOpen(null)}
          />
          <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
            <TaskEditor
              task={open}
              domain={domain}
              onClose={() => setOpen(null)}
            />
          </aside>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Variant B — Publishing desk. Signature: the page is a queue of what is due,
// each item rendered as the post it will become on its channel, with the one
// button that moves it. Campaign health is a quiet rail on the right.
// ---------------------------------------------------------------------------

function PostPreview({ task, domain }: { task: Task; domain: string }) {
  const campaign = CAMPAIGNS.find((c) => c.id === task.campaignId)!
  const isBsky = task.channel === 'bluesky'
  return (
    <div
      className={`rounded-xl border p-4 text-sm ${isBsky ? 'border-blue-200 bg-white dark:border-blue-900 dark:bg-gray-900' : 'border-sky-900/20 bg-white dark:border-sky-900 dark:bg-gray-900'}`}
    >
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 rounded-full bg-brand-gradient" />
        <div>
          <p className="font-semibold text-gray-900 dark:text-white">
            Cloud Native Days Norway
          </p>
          <p className="text-xs text-gray-400">
            {isBsky ? '@cloudnativedays.no' : 'Company page · Follows'}
          </p>
        </div>
        <ChannelDot channel={task.channel} className="ml-auto" />
      </div>
      <p
        className={`mt-3 whitespace-pre-wrap text-gray-800 dark:text-gray-100 ${task.body ? '' : 'text-gray-400 italic'}`}
      >
        {task.body || 'No text yet. Open the task to write it.'}
      </p>
      <div className="mt-3 flex overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="flex w-24 items-center justify-center bg-gray-100 text-gray-400 dark:bg-gray-800">
          {task.asset ? (
            <PhotoIcon className="h-6 w-6" />
          ) : (
            <LinkIcon className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0 p-2">
          <p className="truncate text-xs font-medium text-gray-700 dark:text-gray-200">
            {task.asset ?? task.title}
          </p>
          <p className="truncate text-[11px] text-gray-400">
            {domain}
            {task.link} · utm_campaign={campaign.id}
          </p>
        </div>
      </div>
    </div>
  )
}

function VariantB({ conferenceTitle, domain }: VariantProps) {
  const [editing, setEditing] = useState<Task | null>(null)
  const dueNow = TASKS.filter((t) => t.status === 'due')
  const thisWeek = TASKS.filter(
    (t) =>
      t.status !== 'due' &&
      t.status !== 'published' &&
      t.date > TODAY &&
      t.date <= '2026-09-07',
  )
  const later = TASKS.filter(
    (t) => t.status !== 'published' && t.date > '2026-09-07',
  )

  const renderGroup = ({
    title,
    items,
    hint,
  }: {
    title: string
    items: Task[]
    hint?: string
  }) => (
    <section>
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="font-space-grotesk text-base font-semibold text-gray-900 dark:text-white">
          {title}
        </h2>
        <span className="text-sm text-gray-400">{items.length}</span>
        {hint && <span className="text-xs text-gray-400">{hint}</span>}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((t) => {
          const ch = CHANNELS[t.channel]
          return (
            <div key={t.id} className="flex flex-col gap-3">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>
                  {CAMPAIGNS.find((c) => c.id === t.campaignId)!.name} ·{' '}
                  {fmt(t.date)} · {t.owner}
                </span>
                <StatusPill status={t.status} />
              </div>
              <PostPreview task={t} domain={domain} />
              <div className="flex gap-2">
                {t.status === 'due' && ch.integrated && (
                  <button className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500">
                    Approve and publish
                  </button>
                )}
                {t.status === 'due' && !ch.integrated && (
                  <button className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500">
                    <ArrowTopRightOnSquareIcon className="h-4 w-4" /> Copy and
                    post on LinkedIn
                  </button>
                )}
                {t.status === 'planned' && (
                  <button
                    onClick={() => setEditing(t)}
                    className="flex-1 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900"
                  >
                    Write the post
                  </button>
                )}
                {t.status === 'ready' && (
                  <button
                    onClick={() => setEditing(t)}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                  >
                    Edit
                  </button>
                )}
                <button
                  onClick={() => setEditing(t)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                >
                  …
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<MegaphoneIcon />}
        title="Publishing desk"
        description={
          <>
            What goes out for{' '}
            <span className="font-medium text-brand-cloud-blue dark:text-blue-300">
              {conferenceTitle}
            </span>
            , in the order it is due.
          </>
        }
        actionItems={PlanSourceActions()}
      />
      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="space-y-10">
          {renderGroup({
            title: 'Due now',
            items: dueNow,
            hint: 'Bluesky publishes from here. LinkedIn opens in a tab; paste the URL back.',
          })}
          {renderGroup({ title: 'This week', items: thisWeek })}
          {renderGroup({ title: 'Later', items: later })}
        </div>
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <h2 className="font-space-grotesk text-base font-semibold text-gray-900 dark:text-white">
            Campaigns
          </h2>
          {CAMPAIGNS.map((c) => {
            const t = campaignTotals(c)
            const rate = t.clicks ? Math.round((t.cta / t.clicks) * 100) : 0
            return (
              <div
                key={c.id}
                className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
              >
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${c.color}`} />
                  <p className="font-medium text-gray-900 dark:text-white">
                    {c.name}
                  </p>
                  <span className="ml-auto text-xs text-gray-400">
                    {t.done}/{t.total}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  <div
                    className={`h-full ${c.color}`}
                    style={{ width: `${(t.done / t.total) * 100}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  {t.clicks} clicks →{' '}
                  <span className="font-semibold text-gray-800 dark:text-gray-100">
                    {t.cta}
                  </span>{' '}
                  {c.outcomeLabel.toLowerCase()} {t.clicks ? `(${rate}%)` : ''}
                </p>
              </div>
            )
          })}
        </aside>
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setEditing(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <TaskEditor
              task={editing}
              domain={domain}
              onClose={() => setEditing(null)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Variant C — Campaign ledger. Signature: measurement leads. A campaign rail
// on the left, and the selected campaign's funnel (clicks → CTA → outcome)
// sits above its task table. Editor expands inline in the table row.
// ---------------------------------------------------------------------------

function VariantC({ conferenceTitle, domain }: VariantProps) {
  const [selected, setSelected] = useState<string>('early')
  const [openRow, setOpenRow] = useState<string | null>(null)
  const campaign = CAMPAIGNS.find((c) => c.id === selected)!
  const tasks = TASKS.filter((t) => t.campaignId === selected)
  const tot = campaignTotals(campaign)
  const engagement = tasks.reduce(
    (n, t) => n + (t.metrics?.likes ?? 0) + (t.metrics?.reposts ?? 0),
    0,
  )

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<MegaphoneIcon />}
        title="Campaigns"
        description={
          <>
            What each campaign for{' '}
            <span className="font-medium text-brand-cloud-blue dark:text-blue-300">
              {conferenceTitle}
            </span>{' '}
            is producing, and what is left to do in it.
          </>
        }
        actionItems={PlanSourceActions()}
      />
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <nav className="space-y-1">
          {CAMPAIGNS.map((c) => {
            const t = campaignTotals(c)
            const active = c.id === selected
            return (
              <button
                key={c.id}
                onClick={() => {
                  setSelected(c.id)
                  setOpenRow(null)
                }}
                className={`w-full rounded-lg px-3 py-3 text-left transition ${active ? 'bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-800' : 'hover:bg-gray-100 dark:hover:bg-gray-800/60'}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${c.color}`} />
                  <span className="font-medium text-gray-900 dark:text-white">
                    {c.name}
                  </span>
                  <span className="ml-auto text-xs text-gray-400">
                    {fmt(c.from)}–{fmt(c.to)}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-3 text-xs text-gray-500">
                  <span>
                    {t.done}/{t.total} tasks
                  </span>
                  <span className="font-semibold text-gray-700 dark:text-gray-200">
                    {t.cta}
                  </span>
                  <span className="truncate">
                    {c.outcomeLabel.toLowerCase()}
                  </span>
                </div>
              </button>
            )
          })}
          <button className="mt-2 flex w-full items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-500 hover:border-gray-400 dark:border-gray-700">
            <PlusIcon className="h-4 w-4" /> Add campaign
          </button>
        </nav>

        <div className="space-y-6">
          {/* funnel */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-baseline justify-between">
              <h2 className="font-space-grotesk text-lg font-semibold text-gray-900 dark:text-white">
                {campaign.name}
              </h2>
              <span className="text-xs text-gray-400">
                Measured against: {campaign.outcomeLabel}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                {
                  label: 'Engagement',
                  value: engagement,
                  sub: 'likes + reposts, Bluesky only',
                  icon: SparklesIcon,
                  w: 100,
                },
                {
                  label: 'Link clicks',
                  value: tot.clicks,
                  sub: 'Pirsch, by utm_campaign',
                  icon: CursorArrowRaysIcon,
                  w: 100,
                },
                {
                  label: campaign.outcomeLabel,
                  value: tot.cta,
                  sub: tot.clicks
                    ? `${Math.round((tot.cta / tot.clicks) * 100)}% of clicks`
                    : '—',
                  icon: FlagIcon,
                  w: tot.clicks ? (tot.cta / tot.clicks) * 100 : 0,
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800/60"
                >
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <s.icon className="h-4 w-4" />
                    {s.label}
                  </div>
                  <p className="font-space-grotesk mt-1 text-3xl font-bold text-gray-900 dark:text-white">
                    {s.value}
                  </p>
                  <div className="mt-2 h-1 overflow-hidden rounded bg-gray-200 dark:bg-gray-700">
                    <div
                      className={`h-full ${campaign.color}`}
                      style={{ width: `${s.w}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-gray-400">{s.sub}</p>
                </div>
              ))}
            </div>
          </div>

          {/* task table */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase dark:bg-gray-800/60">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Task</th>
                  <th className="px-4 py-2">Channel</th>
                  <th className="px-4 py-2">Owner</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Clicks → outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {tasks.map((t) => (
                  <Fragment key={t.id}>
                    <tr
                      onClick={() => setOpenRow(openRow === t.id ? null : t.id)}
                      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                        {fmt(t.date)}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                        {t.title}
                      </td>
                      <td className="px-4 py-3">
                        <ChannelDot channel={t.channel} />
                      </td>
                      <td className="px-4 py-3 text-gray-500">{t.owner}</td>
                      <td className="px-4 py-3">
                        <StatusPill status={t.status} />
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-gray-600 dark:text-gray-300">
                        {t.metrics
                          ? `${t.metrics.clicks} → ${t.metrics.ctaEvents}`
                          : '—'}
                      </td>
                    </tr>
                    {openRow === t.id && (
                      <tr>
                        <td
                          colSpan={6}
                          className="bg-gray-50 p-5 dark:bg-gray-800/40"
                        >
                          <div className="max-w-2xl">
                            <TaskEditor
                              task={t}
                              domain={domain}
                              onClose={() => setOpenRow(null)}
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
            <button className="flex w-full items-center gap-2 px-4 py-3 text-sm text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/40">
              <PlusIcon className="h-4 w-4" /> Add task to {campaign.name}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Switcher
// ---------------------------------------------------------------------------

export const VARIANTS = [
  { key: 'studio', name: 'Current page (promo studio)', component: null },
  { key: 'A', name: 'Milestone timeline + drawer', component: VariantA },
  { key: 'B', name: 'Publishing desk', component: VariantB },
  { key: 'C', name: 'Campaign ledger', component: VariantC },
] as const

export type VariantKey = (typeof VARIANTS)[number]['key']

export function isVariantKey(
  v: string | undefined,
): v is Exclude<VariantKey, 'studio'> {
  return v === 'A' || v === 'B' || v === 'C'
}

export function MarketingPlanVariant({
  variant,
  ...props
}: VariantProps & { variant: Exclude<VariantKey, 'studio'> }) {
  const V = VARIANTS.find((v) => v.key === variant)!.component!
  return <V {...props} />
}

export function PrototypeSwitcher({ current }: { current: VariantKey }) {
  const router = useRouter()
  const params = useSearchParams()
  const idx = Math.max(
    0,
    VARIANTS.findIndex((v) => v.key === current),
  )
  const variant = VARIANTS[idx]

  const cycle = useCallback(
    (dir: 1 | -1) => {
      const next = VARIANTS[(idx + dir + VARIANTS.length) % VARIANTS.length]
      const q = new URLSearchParams(params.toString())
      if (next.key === 'studio') q.delete('variant')
      else q.set('variant', next.key)
      const qs = q.toString()
      router.replace(qs ? `?${qs}` : '?')
    },
    [idx, router, params],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (
        t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.isContentEditable
      )
        return
      if (e.key === 'ArrowLeft') cycle(-1)
      if (e.key === 'ArrowRight') cycle(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cycle])

  const label = useMemo(
    () => `${variant.key === 'studio' ? '·' : variant.key} — ${variant.name}`,
    [variant],
  )

  if (process.env.NODE_ENV === 'production') return null
  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-full bg-amber-400 px-4 py-2 text-sm font-medium text-gray-900 shadow-lg ring-2 ring-white">
      <button onClick={() => cycle(-1)} aria-label="previous variant">
        <ChevronLeftIcon className="h-4 w-4" />
      </button>
      <span className="whitespace-nowrap">PROTOTYPE {label}</span>
      <button onClick={() => cycle(1)} aria-label="next variant">
        <ChevronRightIcon className="h-4 w-4" />
      </button>
    </div>
  )
}
