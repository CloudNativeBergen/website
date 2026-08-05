'use client'

// PROTOTYPE — throwaway. Three structurally different takes on the social
// composer / variant editor / queue (wayfinder #790). All state in memory,
// all actions are stubs. See page.tsx.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowPathIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  HandRaisedIcon,
  PencilSquareIcon,
  PhotoIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'

// ---------------------------------------------------------------------------
// Mock domain data (mirrors the decided model: post → per-platform variants)
// ---------------------------------------------------------------------------

type Platform =
  | 'linkedin'
  | 'bluesky'
  | 'x'
  | 'facebook'
  | 'instagram'
  | 'threads'
  | 'mastodon'

type VariantStatus =
  | 'draft'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'awaiting-manual'

interface PlatformMeta {
  key: Platform
  label: string
  short: string
  maxChars: number
  requiresImage?: boolean
  connected: boolean
  aspect: string
  color: string
}

const PLATFORMS: PlatformMeta[] = [
  { key: 'linkedin', label: 'LinkedIn', short: 'in', maxChars: 3000, connected: true, aspect: '1.91:1', color: 'bg-sky-700' },
  { key: 'bluesky', label: 'Bluesky', short: 'bs', maxChars: 300, connected: true, aspect: 'free', color: 'bg-blue-500' },
  { key: 'x', label: 'X', short: 'x', maxChars: 280, connected: false, aspect: '16:9', color: 'bg-neutral-800' },
  { key: 'facebook', label: 'Facebook', short: 'fb', maxChars: 5000, connected: false, aspect: '1.91:1', color: 'bg-blue-700' },
  { key: 'instagram', label: 'Instagram', short: 'ig', maxChars: 2200, requiresImage: true, connected: false, aspect: '1:1', color: 'bg-pink-600' },
  { key: 'threads', label: 'Threads', short: 'th', maxChars: 500, connected: false, aspect: 'free', color: 'bg-stone-700' },
  { key: 'mastodon', label: 'Mastodon', short: 'ma', maxChars: 500, connected: true, aspect: 'free', color: 'bg-indigo-600' },
]

const meta = (p: Platform) => PLATFORMS.find((m) => m.key === p)!

interface MockVariant {
  platform: Platform
  body: string
  scheduledAt: string // ISO
  customTime: boolean
  status: VariantStatus
  failureKind?: 'rejected' | 'ambiguous' | 'credential-expired'
  failureMessage?: string
}

interface MockPost {
  id: string
  title: string
  body: string
  hasImage: boolean
  defaultTime: string
  variants: MockVariant[]
}

const QUEUE: MockPost[] = [
  {
    id: 'p1',
    title: 'CFP closes Friday',
    body: 'Last call! The CFP for Cloud Native Day Bergen closes this Friday at midnight. Submit your talk now → https://2026.cloudnativebergen.dev/cfp',
    hasImage: true,
    defaultTime: '2026-08-06T08:00',
    variants: [
      { platform: 'linkedin', body: 'Last call! The CFP for Cloud Native Day Bergen closes this Friday…', scheduledAt: '2026-08-06T08:00', customTime: false, status: 'scheduled' },
      { platform: 'bluesky', body: 'Last call! CFP closes Friday → 2026.cloudnativebergen.dev/cfp', scheduledAt: '2026-08-06T17:00', customTime: true, status: 'scheduled' },
      { platform: 'x', body: 'Last call! CFP closes Friday.', scheduledAt: '2026-08-06T08:00', customTime: false, status: 'awaiting-manual' },
    ],
  },
  {
    id: 'p2',
    title: 'Keynote announcement',
    body: 'We are thrilled to announce our opening keynote speaker…',
    hasImage: true,
    defaultTime: '2026-08-05T09:00',
    variants: [
      { platform: 'linkedin', body: 'We are thrilled to announce our opening keynote speaker…', scheduledAt: '2026-08-05T09:00', customTime: false, status: 'published' },
      { platform: 'mastodon', body: 'Keynote announced!', scheduledAt: '2026-08-05T09:00', customTime: false, status: 'failed', failureKind: 'rejected', failureMessage: 'Media type not accepted by instance' },
      { platform: 'bluesky', body: 'Keynote announced!', scheduledAt: '2026-08-05T09:00', customTime: false, status: 'failed', failureKind: 'credential-expired', failureMessage: 'Session could not be created — reconnect the account' },
    ],
  },
  {
    id: 'p3',
    title: 'Early-bird tickets',
    body: 'Early-bird tickets are live. Grab yours before September.',
    hasImage: false,
    defaultTime: '2026-08-08T12:00',
    variants: [
      { platform: 'linkedin', body: 'Early-bird tickets are live.', scheduledAt: '2026-08-08T12:00', customTime: false, status: 'draft' },
      { platform: 'threads', body: 'Early-bird tickets are live.', scheduledAt: '2026-08-08T12:00', customTime: false, status: 'draft' },
    ],
  },
]

const STATUS_STYLE: Record<VariantStatus, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  scheduled: { label: 'Scheduled', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  publishing: { label: 'Publishing…', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  published: { label: 'Published', cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  failed: { label: 'Failed', cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  'awaiting-manual': { label: 'Manual due', cls: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' },
}

// ---------------------------------------------------------------------------
// Shared atoms (small on purpose — each variant owns its own layout)
// ---------------------------------------------------------------------------

function PlatformDot({ p, size = 'h-6 w-6 text-[10px]' }: { p: Platform; size?: string }) {
  const m = meta(p)
  return (
    <span
      className={`${m.color} ${size} inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white uppercase`}
      title={m.label}
    >
      {m.short}
    </span>
  )
}

function StatusBadge({ s }: { s: VariantStatus }) {
  const st = STATUS_STYLE[s]
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${st.cls}`}>
      {st.label}
    </span>
  )
}

function CharCount({ text, max }: { text: string; max: number }) {
  const n = text.length
  const over = n > max
  return (
    <span className={`text-xs tabular-nums ${over ? 'font-semibold text-red-600' : 'text-gray-500'}`}>
      {n}/{max}
    </span>
  )
}

function FakeCrop({ aspect }: { aspect: string }) {
  const ratio = aspect === '1:1' ? 'aspect-square' : aspect === '16:9' ? 'aspect-video' : aspect === '1.91:1' ? 'aspect-[1.91/1]' : 'aspect-[4/3]'
  return (
    <div className="relative w-40 overflow-hidden rounded-md border border-gray-300 dark:border-gray-700">
      <div className={`${ratio} w-full bg-gradient-to-br from-indigo-300 via-sky-200 to-emerald-200 dark:from-indigo-800 dark:via-sky-900 dark:to-emerald-900`} />
      <div className="absolute inset-2 rounded-sm border-2 border-dashed border-white/80 mix-blend-difference" />
      <span className="absolute right-1 bottom-1 rounded bg-black/60 px-1 text-[10px] text-white">{aspect}</span>
    </div>
  )
}

function FailureActions({ v }: { v: MockVariant }) {
  if (v.status === 'failed')
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-red-600 dark:text-red-400">
          {v.failureKind}: {v.failureMessage}
        </span>
        {v.failureKind !== 'ambiguous' ? (
          <button className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950">
            <ArrowPathIcon className="h-3.5 w-3.5" /> Retry
          </button>
        ) : (
          <span className="text-xs text-gray-500 italic">check platform before retrying</span>
        )}
      </div>
    )
  if (v.status === 'awaiting-manual')
    return (
      <div className="flex items-center gap-2">
        <button className="inline-flex items-center gap-1 rounded-md border border-purple-300 px-2 py-1 text-xs font-medium text-purple-700 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-300 dark:hover:bg-purple-950">
          <PencilSquareIcon className="h-3.5 w-3.5" /> Copy text
        </button>
        <button className="inline-flex items-center gap-1 rounded-md bg-purple-600 px-2 py-1 text-xs font-medium text-white hover:bg-purple-700">
          <CheckCircleIcon className="h-3.5 w-3.5" /> Mark as posted
        </button>
      </div>
    )
  return null
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

// ---------------------------------------------------------------------------
// Variant A — "Wizard": linear steps Compose → Variants → Schedule, queue table
// ---------------------------------------------------------------------------

function VariantA() {
  const [step, setStep] = useState(0)
  const [picked, setPicked] = useState<Platform[]>(['linkedin', 'bluesky', 'mastodon'])
  const steps = ['Compose', 'Per-platform variants', 'Schedule & review']

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <ol className="mb-6 flex items-center gap-2">
          {steps.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <button
                onClick={() => setStep(i)}
                className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${i === step ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'}`}
              >
                <span className="font-semibold">{i + 1}</span> {s}
              </button>
              {i < steps.length - 1 && <ChevronRightIcon className="h-4 w-4 text-gray-400" />}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <div className="space-y-4">
            <textarea
              className="w-full rounded-lg border border-gray-300 p-3 text-sm dark:border-gray-700 dark:bg-gray-950"
              rows={5}
              defaultValue="Last call! The CFP for Cloud Native Day Bergen closes this Friday at midnight. Submit your talk now → https://2026.cloudnativebergen.dev/cfp"
            />
            <div className="flex items-center gap-3">
              <button className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700">
                <PhotoIcon className="h-4 w-4" /> Upload image
              </button>
              <button className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700">
                <PhotoIcon className="h-4 w-4" /> Pick from gallery / share cards
              </button>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Post to:</p>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((m) => {
                  const on = picked.includes(m.key)
                  return (
                    <button
                      key={m.key}
                      onClick={() => setPicked((p) => (on ? p.filter((x) => x !== m.key) : [...p, m.key]))}
                      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${on ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950' : 'border-gray-300 opacity-60 dark:border-gray-700'}`}
                    >
                      <PlatformDot p={m.key} size="h-5 w-5 text-[9px]" />
                      {m.label}
                      {!m.connected && <span className="text-xs text-purple-600 dark:text-purple-400">manual</span>}
                    </button>
                  )
                })}
              </div>
            </div>
            <button onClick={() => setStep(1)} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white">
              Generate {picked.length} variants →
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            {picked.map((p) => {
              const m = meta(p)
              const body = 'Last call! CFP closes Friday → 2026.cloudnativebergen.dev/cfp'
              return (
                <div key={p} className="flex gap-4 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                  <PlatformDot p={p} />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{m.label}</span>
                      <CharCount text={body} max={m.maxChars} />
                    </div>
                    <textarea className="w-full rounded-md border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-950" rows={3} defaultValue={body} />
                  </div>
                  <FakeCrop aspect={m.aspect} />
                </div>
              )
            })}
            <button onClick={() => setStep(2)} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white">
              Continue to schedule →
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <label className="flex items-center gap-3 text-sm">
              Default time
              <input type="datetime-local" defaultValue="2026-08-06T08:00" className="rounded-md border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-950" />
              <span className="text-gray-500">(Europe/Oslo)</span>
            </label>
            <table className="w-full text-sm">
              <tbody>
                {picked.map((p) => (
                  <tr key={p} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="py-2"><div className="flex items-center gap-2"><PlatformDot p={p} size="h-5 w-5 text-[9px]" />{meta(p).label}</div></td>
                    <td><label className="flex items-center gap-2 text-xs text-gray-500"><input type="checkbox" defaultChecked={p === 'bluesky'} /> custom time</label></td>
                    <td><input type="datetime-local" defaultValue={p === 'bluesky' ? '2026-08-06T17:00' : '2026-08-06T08:00'} disabled={p !== 'bluesky'} className="rounded-md border border-gray-300 px-2 py-1 text-xs disabled:opacity-40 dark:border-gray-700 dark:bg-gray-950" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white">Schedule all</button>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Queue</h2>
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase dark:bg-gray-900">
              <tr>
                <th className="px-4 py-2">Post</th>
                <th className="px-4 py-2">Platform</th>
                <th className="px-4 py-2">When</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {QUEUE.flatMap((post) =>
                post.variants.map((v) => (
                  <tr key={post.id + v.platform} className="border-t border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-950">
                    <td className="px-4 py-2 font-medium">{post.title}</td>
                    <td className="px-4 py-2"><div className="flex items-center gap-2"><PlatformDot p={v.platform} size="h-5 w-5 text-[9px]" />{meta(v.platform).label}</div></td>
                    <td className="px-4 py-2 whitespace-nowrap text-gray-500">{fmt(v.scheduledAt)}{v.customTime && ' *'}</td>
                    <td className="px-4 py-2"><StatusBadge s={v.status} /></td>
                    <td className="px-4 py-2"><FailureActions v={v} /></td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Variant B — "Studio": split pane, canonical left, live previews right,
// queue as a horizontal timeline strip on top
// ---------------------------------------------------------------------------

function VariantB() {
  const [picked, setPicked] = useState<Platform[]>(['linkedin', 'bluesky', 'x', 'mastodon'])
  const [text, setText] = useState(
    'Last call! The CFP for Cloud Native Day Bergen closes this Friday at midnight. Submit your talk now → https://2026.cloudnativebergen.dev/cfp',
  )

  return (
    <div className="space-y-6">
      <section className="overflow-x-auto">
        <div className="flex min-w-max items-stretch gap-2 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
          {QUEUE.flatMap((post) => post.variants.map((v) => ({ post, v }))).sort((a, b) => a.v.scheduledAt.localeCompare(b.v.scheduledAt)).map(({ post, v }) => (
            <div key={post.id + v.platform} className="w-44 shrink-0 rounded-lg border border-gray-200 p-2 text-xs dark:border-gray-800">
              <div className="mb-1 flex items-center justify-between gap-1">
                <PlatformDot p={v.platform} size="h-4 w-4 text-[8px]" />
                <StatusBadge s={v.status} />
              </div>
              <p className="truncate font-medium">{post.title}</p>
              <p className="text-gray-500">{fmt(v.scheduledAt)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="text-sm font-semibold text-gray-500 uppercase">Canonical post</h2>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} className="w-full rounded-lg border border-gray-300 p-3 text-sm dark:border-gray-700 dark:bg-gray-950" />
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700"><PhotoIcon className="h-4 w-4" /> Image</button>
            <label className="ml-auto flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <ClockIcon className="h-4 w-4" />
              <input type="datetime-local" defaultValue="2026-08-06T08:00" className="rounded-md border border-gray-300 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-950" />
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PLATFORMS.map((m) => {
              const on = picked.includes(m.key)
              return (
                <button key={m.key} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== m.key) : [...p, m.key]))} className={`rounded-full p-0.5 ${on ? 'ring-2 ring-indigo-500' : 'opacity-40'}`}>
                  <PlatformDot p={m.key} />
                </button>
              )
            })}
          </div>
          <button className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white">Schedule {picked.length} posts</button>
        </div>

        <div className="space-y-3">
          {picked.map((p) => {
            const m = meta(p)
            const truncated = text.length > m.maxChars ? text.slice(0, m.maxChars - 1) + '…' : text
            return (
              <div key={p} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                <div className="mb-2 flex items-center gap-2">
                  <PlatformDot p={p} size="h-5 w-5 text-[9px]" />
                  <span className="text-sm font-medium">{m.label}</span>
                  {!m.connected && <span className="rounded bg-purple-100 px-1.5 text-xs text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">manual</span>}
                  <span className="ml-auto"><CharCount text={truncated} max={m.maxChars} /></span>
                  <label className="flex items-center gap-1 text-xs text-gray-500"><input type="checkbox" /> own time</label>
                </div>
                <div className="flex gap-3">
                  <p contentEditable suppressContentEditableWarning className="min-h-12 flex-1 rounded-md border border-transparent p-2 text-sm hover:border-gray-300 focus:border-indigo-400 focus:outline-none dark:hover:border-gray-700">
                    {truncated}
                  </p>
                  <FakeCrop aspect={m.aspect} />
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Variant C — "Calendar-first": week calendar is the page; compose in a
// slide-over drawer with variant tabs; chips carry status colors
// ---------------------------------------------------------------------------

function VariantC() {
  const [drawer, setDrawer] = useState(false)
  const [tab, setTab] = useState<Platform>('linkedin')
  const days = ['Mon 4', 'Tue 5', 'Wed 6', 'Thu 7', 'Fri 8', 'Sat 9', 'Sun 10']
  const dayKey = (iso: string) => new Date(iso).getDate() - 4 // Aug 4 = col 0

  return (
    <div className="relative">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <button className="rounded-md border border-gray-300 p-1 dark:border-gray-700"><ChevronLeftIcon className="h-4 w-4" /></button>
          <CalendarDaysIcon className="h-5 w-5 text-gray-400" /> August 4–10, 2026
          <button className="rounded-md border border-gray-300 p-1 dark:border-gray-700"><ChevronRightIcon className="h-4 w-4" /></button>
        </div>
        <button onClick={() => setDrawer(true)} className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white">
          <PlusIcon className="h-4 w-4" /> New post
        </button>
      </div>

      <div className="grid grid-cols-7 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
        {days.map((d, col) => (
          <div key={d} className="min-h-72 border-r border-gray-100 bg-white last:border-r-0 dark:border-gray-800 dark:bg-gray-950">
            <p className="border-b border-gray-100 px-2 py-1.5 text-xs font-semibold text-gray-500 dark:border-gray-800">{d}</p>
            <div className="space-y-1.5 p-1.5">
              {QUEUE.flatMap((post) =>
                post.variants.filter((v) => dayKey(v.scheduledAt) === col).map((v) => (
                  <button key={post.id + v.platform} onClick={() => setDrawer(true)} className={`block w-full rounded-md border-l-4 p-1.5 text-left text-xs shadow-sm ${
                    v.status === 'failed' ? 'border-red-500 bg-red-50 dark:bg-red-950/40'
                    : v.status === 'awaiting-manual' ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/40'
                    : v.status === 'published' ? 'border-green-500 bg-green-50 dark:bg-green-950/40'
                    : v.status === 'draft' ? 'border-gray-300 bg-gray-50 dark:bg-gray-900'
                    : 'border-blue-500 bg-blue-50 dark:bg-blue-950/40'
                  }`}>
                    <span className="flex items-center gap-1">
                      <PlatformDot p={v.platform} size="h-3.5 w-3.5 text-[7px]" />
                      <span className="truncate font-medium">{post.title}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-[10px] text-gray-500">
                      {new Date(v.scheduledAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      {v.status === 'failed' && <ExclamationTriangleIcon className="h-3 w-3 text-red-500" />}
                      {v.status === 'awaiting-manual' && <HandRaisedIcon className="h-3 w-3 text-purple-500" />}
                    </span>
                  </button>
                )),
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        {QUEUE.flatMap((post) => post.variants.filter((v) => v.status === 'failed' || v.status === 'awaiting-manual').map((v) => (
          <div key={post.id + v.platform} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm dark:border-gray-800 dark:bg-gray-900">
            <PlatformDot p={v.platform} size="h-5 w-5 text-[9px]" />
            <span className="font-medium">{post.title}</span>
            <StatusBadge s={v.status} />
            <span className="ml-auto"><FailureActions v={v} /></span>
          </div>
        )))}
      </div>

      {drawer && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawer(false)} />
          <div className="absolute top-0 right-0 h-full w-full max-w-xl overflow-y-auto border-l border-gray-200 bg-white p-6 shadow-xl dark:border-gray-800 dark:bg-gray-950">
            <h2 className="mb-4 text-lg font-semibold">CFP closes Friday</h2>
            <textarea rows={4} className="mb-3 w-full rounded-lg border border-gray-300 p-3 text-sm dark:border-gray-700 dark:bg-gray-900" defaultValue="Last call! The CFP for Cloud Native Day Bergen closes this Friday at midnight. Submit your talk now → https://2026.cloudnativebergen.dev/cfp" />
            <div className="mb-4 flex items-center gap-2 text-sm">
              <ClockIcon className="h-4 w-4 text-gray-400" />
              <input type="datetime-local" defaultValue="2026-08-06T08:00" className="rounded-md border border-gray-300 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900" />
              <button className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2 py-1 text-xs dark:border-gray-700"><PhotoIcon className="h-4 w-4" /> 1 image</button>
            </div>

            <div className="mb-3 flex gap-1 border-b border-gray-200 dark:border-gray-800">
              {(['linkedin', 'bluesky', 'x'] as Platform[]).map((p) => (
                <button key={p} onClick={() => setTab(p)} className={`flex items-center gap-1.5 rounded-t-md px-3 py-1.5 text-sm ${tab === p ? 'border border-b-0 border-gray-200 bg-white font-medium dark:border-gray-800 dark:bg-gray-950' : 'text-gray-500'}`}>
                  <PlatformDot p={p} size="h-4 w-4 text-[8px]" /> {meta(p).label}
                </button>
              ))}
              <button className="px-2 text-gray-400"><PlusIcon className="h-4 w-4" /></button>
            </div>

            {(() => {
              const m = meta(tab)
              const body = tab === 'bluesky' ? 'Last call! CFP closes Friday → 2026.cloudnativebergen.dev/cfp' : 'Last call! The CFP for Cloud Native Day Bergen closes this Friday at midnight.'
              return (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    {!m.connected ? <span className="text-purple-600 dark:text-purple-400">not connected — will be a manual post</span> : <span>posts automatically</span>}
                    <CharCount text={body} max={m.maxChars} />
                  </div>
                  <textarea rows={4} className="w-full rounded-lg border border-gray-300 p-3 text-sm dark:border-gray-700 dark:bg-gray-900" defaultValue={body} />
                  <div className="flex items-center gap-4">
                    <FakeCrop aspect={m.aspect} />
                    <label className="flex items-center gap-2 text-xs text-gray-500"><input type="checkbox" defaultChecked={tab === 'bluesky'} /> custom time
                      <input type="datetime-local" defaultValue="2026-08-06T17:00" className="rounded-md border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900" />
                    </label>
                  </div>
                  <button className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white">Schedule all variants</button>
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Switcher
// ---------------------------------------------------------------------------

const VARIANTS = [
  { key: 'A', name: 'Wizard + queue table', component: VariantA },
  { key: 'B', name: 'Split-pane studio', component: VariantB },
  { key: 'C', name: 'Calendar-first + drawer', component: VariantC },
]

export function SocialPrototypeClient() {
  const router = useRouter()
  const params = useSearchParams()
  const current = params.get('variant') ?? 'A'
  const idx = Math.max(0, VARIANTS.findIndex((v) => v.key === current))
  const variant = VARIANTS[idx]

  const cycle = useCallback(
    (dir: 1 | -1) => {
      const next = VARIANTS[(idx + dir + VARIANTS.length) % VARIANTS.length]
      router.replace(`?variant=${next.key}`)
    },
    [idx, router],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return
      if (e.key === 'ArrowLeft') cycle(-1)
      if (e.key === 'ArrowRight') cycle(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cycle])

  const Body = useMemo(() => variant.component, [variant])

  return (
    <div className="p-6">
      <div className="mb-6">
        <p className="text-xs font-semibold tracking-wide text-amber-600 uppercase dark:text-amber-400">
          Prototype — social composer (#790)
        </p>
        <h1 className="text-2xl font-bold">Social media</h1>
        <p className="text-sm text-gray-500">Compose once, publish everywhere as the conference.</p>
      </div>
      <Body />
      {process.env.NODE_ENV !== 'production' && (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-gray-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-white dark:text-gray-900">
          <button onClick={() => cycle(-1)} aria-label="previous variant"><ChevronLeftIcon className="h-4 w-4" /></button>
          <span className="font-medium whitespace-nowrap">{variant.key} — {variant.name}</span>
          <button onClick={() => cycle(1)} aria-label="next variant"><ChevronRightIcon className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  )
}
