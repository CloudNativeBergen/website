'use client'

/**
 * PROTOTYPE — throwaway. Answers "what does the admin Session Feedback page
 * look like, and how does feedback appear on a talk's admin page?"
 * (wayfinder ticket #1422). Three variants, each built around a different
 * primary job: rank (A), moderate (B), investigate one talk (C). Mock data,
 * in-memory actions only. Branch prototype/speaker-feedback-admin; never merged.
 */
import { Fragment, useMemo, useState } from 'react'
import {
  ArrowPathIcon,
  ChatBubbleLeftRightIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  EyeIcon,
  EyeSlashIcon,
  FlagIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'

type Colour = 'green' | 'yellow' | 'red'
export interface Resp {
  id: string
  colour: Colour
  comment?: string
  at: string // HH:mm
  day: string
  flagged?: boolean
  hidden?: boolean
}
export interface TalkRow {
  id: string
  title: string
  speakers: string
  format: string
  slot: string
  cards?: Record<Colour, number>
  responses: Resp[]
}
export interface AdminFeedbackProps {
  variant: 'A' | 'B' | 'C'
  talks: TalkRow[]
}

const COLOURS: Colour[] = ['green', 'yellow', 'red']
const LABEL: Record<Colour, string> = {
  green: 'Loved it',
  yellow: 'It was OK',
  red: 'Not for me',
}
const BG: Record<Colour, string> = {
  green: 'bg-green-600',
  yellow: 'bg-yellow-400',
  red: 'bg-red-600',
}
const MIN = 10
const panel =
  'rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800'

function counts(t: TalkRow): Record<Colour, number> {
  const c = {
    green: t.cards?.green ?? 0,
    yellow: t.cards?.yellow ?? 0,
    red: t.cards?.red ?? 0,
  }
  for (const r of t.responses) c[r.colour]++
  return c
}
const sum = (c: Record<Colour, number>) => c.green + c.yellow + c.red
const share = (c: Record<Colour, number>) => (sum(c) ? c.green / sum(c) : 0)

function Bar({
  c,
  className = 'h-2',
}: {
  c: Record<Colour, number>
  className?: string
}) {
  const t = sum(c) || 1
  return (
    <div
      className={`flex w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700 ${className}`}
    >
      {COLOURS.map((k) => (
        <div
          key={k}
          className={BG[k]}
          style={{ width: `${(c[k] / t) * 100}%` }}
        />
      ))}
    </div>
  )
}

function useTalks(initial: TalkRow[]) {
  const [talks, setTalks] = useState(initial)
  const [log, setLog] = useState<string[]>([])
  const patch = (
    talkId: string,
    ids: string[],
    f: (r: Resp) => Resp | null,
    what: string,
  ) => {
    setTalks((ts) =>
      ts.map((t) =>
        t.id !== talkId
          ? t
          : {
              ...t,
              responses: t.responses.flatMap((r) =>
                ids.includes(r.id) ? (f(r) ? [f(r)!] : []) : [r],
              ),
            },
      ),
    )
    setLog((l) => [...l, `${what} ${ids.length} response(s) on ${talkId}`])
  }
  return {
    talks,
    log,
    hide: (t: string, id: string) =>
      patch(t, [id], (r) => ({ ...r, hidden: true, flagged: false }), 'hide'),
    unhide: (t: string, id: string) =>
      patch(t, [id], (r) => ({ ...r, hidden: false }), 'unhide'),
    keep: (t: string, id: string) =>
      patch(t, [id], (r) => ({ ...r, flagged: false }), 'keep (clear flag)'),
    remove: (t: string, ids: string[]) => patch(t, ids, () => null, 'REMOVE'),
  }
}
type Actions = ReturnType<typeof useTalks>

function Header({ talks }: { talks: TalkRow[] }) {
  const all = talks.reduce(
    (a, t) => {
      const c = counts(t)
      return {
        green: a.green + c.green,
        yellow: a.yellow + c.yellow,
        red: a.red + c.red,
      }
    },
    { green: 0, yellow: 0, red: 0 },
  )
  const comments = talks
    .flatMap((t) => t.responses)
    .filter((r) => r.comment).length
  const flagged = talks
    .flatMap((t) => t.responses)
    .filter((r) => r.flagged).length
  return (
    <AdminPageHeader
      icon={<ChatBubbleLeftRightIcon />}
      title="Session Feedback"
      description="What attendees thought of each session: scanned Feedback Responses plus Card Counts."
      contextHighlight="Cloud Native Days Norway 2026"
      stats={[
        { value: sum(all), label: 'Responses', color: 'blue' },
        {
          value: `${Math.round(share(all) * 100)}%`,
          label: 'Loved it',
          color: 'green',
        },
        { value: comments, label: 'Comments', color: 'slate' },
        { value: flagged, label: 'Flagged', color: flagged ? 'red' : 'slate' },
      ]}
    />
  )
}

function CommentRow({
  t,
  r,
  a,
  showTalk = false,
}: {
  t: TalkRow
  r: Resp
  a: Actions
  showTalk?: boolean
}) {
  const btn =
    'inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium hover:bg-gray-100 dark:hover:bg-gray-700'
  return (
    <li className={`flex gap-3 py-3 ${r.hidden ? 'opacity-50' : ''}`}>
      <span
        className={`mt-1.5 size-2.5 shrink-0 rounded-full ${BG[r.colour]}`}
      />
      <div className="min-w-0 flex-1">
        {showTalk && (
          <p className="mb-0.5 truncate text-xs font-medium text-gray-500">
            {t.title}
          </p>
        )}
        <p className="text-sm text-gray-800 dark:text-gray-200">{r.comment}</p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
          {LABEL[r.colour]} · {r.day} {r.at}
          {r.flagged && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-1.5 text-red-700 dark:bg-red-900/30 dark:text-red-300">
              <FlagIcon className="size-3" /> Flagged by speaker
            </span>
          )}
          {r.hidden && (
            <span className="rounded-full bg-gray-100 px-1.5 dark:bg-gray-700">
              Hidden from speakers
            </span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-start gap-1">
        {r.flagged && (
          <button
            className={`${btn} text-gray-700 dark:text-gray-200`}
            onClick={() => a.keep(t.id, r.id)}
          >
            Keep
          </button>
        )}
        {r.hidden ? (
          <button
            className={`${btn} text-gray-700 dark:text-gray-200`}
            onClick={() => a.unhide(t.id, r.id)}
          >
            <EyeIcon className="size-4" /> Unhide
          </button>
        ) : (
          <button
            className={`${btn} text-gray-700 dark:text-gray-200`}
            onClick={() => a.hide(t.id, r.id)}
          >
            <EyeSlashIcon className="size-4" /> Hide
          </button>
        )}
        <button
          className={`${btn} text-red-700 dark:text-red-400`}
          onClick={() => a.remove(t.id, [r.id])}
          title="Remove response (colour and comment)"
        >
          <TrashIcon className="size-4" />
        </button>
      </div>
    </li>
  )
}

/** A — Leaderboard. One sortable table; rows expand to that talk's comments. */
function VariantTable({ talks: initial }: AdminFeedbackProps) {
  const a = useTalks(initial)
  const [sort, setSort] = useState<'share' | 'total' | 'comments'>('share')
  const [open, setOpen] = useState<string | null>(null)
  const rows = useMemo(() => {
    const r = a.talks.map((t) => ({
      t,
      c: counts(t),
      comments: t.responses.filter((x) => x.comment).length,
      flags: t.responses.filter((x) => x.flagged).length,
    }))
    return r.sort((x, y) => {
      if (sort === 'share') {
        const fx = sum(x.c) >= MIN,
          fy = sum(y.c) >= MIN
        if (fx !== fy) return fx ? -1 : 1
        return share(y.c) - share(x.c)
      }
      return sort === 'total' ? sum(y.c) - sum(x.c) : y.comments - x.comments
    })
  }, [a.talks, sort])
  const flagged = a.talks.flatMap((t) =>
    t.responses.filter((r) => r.flagged).map((r) => ({ t, r })),
  )
  const th = (k: typeof sort, label: string) => (
    <th className="px-3 py-2 text-right">
      <button
        className={`text-xs font-semibold uppercase ${sort === k ? 'text-blue-600' : 'text-gray-500'}`}
        onClick={() => setSort(k)}
      >
        {label}
        {sort === k && ' ↓'}
      </button>
    </th>
  )
  return (
    <>
      <Header talks={a.talks} />
      {flagged.length > 0 && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
          <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-red-800 dark:text-red-300">
            <FlagIcon className="size-4" /> {flagged.length} comment(s) flagged
            by speakers
          </p>
          <ul>
            {flagged.map(({ t, r }) => (
              <CommentRow key={r.id} t={t} r={r} a={a} showTalk />
            ))}
          </ul>
        </div>
      )}
      <div className={`${panel} overflow-x-auto`}>
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                Session
              </th>
              <th className="w-48 px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                Spread
              </th>
              {th('share', 'Loved it')}
              {th('total', 'Responses')}
              {th('comments', 'Comments')}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {rows.map(({ t, c, comments, flags }) => {
              const few = sum(c) < MIN
              return (
                <Fragment key={t.id}>
                  <tr
                    className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 ${few ? 'text-gray-400' : ''}`}
                    onClick={() => setOpen(open === t.id ? null : t.id)}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {open === t.id ? (
                          <ChevronDownIcon className="size-4 shrink-0" />
                        ) : (
                          <ChevronRightIcon className="size-4 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium text-gray-900 dark:text-white">
                            {t.title}
                          </p>
                          <p className="text-xs text-gray-500">
                            {t.speakers} · {t.format} · {t.slot}
                          </p>
                        </div>
                        {flags > 0 && (
                          <FlagIcon className="size-4 shrink-0 text-red-600" />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Bar c={c} />
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {few ? (
                        <span className="text-xs font-normal">too few</span>
                      ) : (
                        `${Math.round(share(c) * 100)}%`
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {sum(c)}
                      {t.cards && (
                        <span className="text-xs text-gray-400">
                          {' '}
                          ({sum(t.cards)} cards)
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">{comments}</td>
                  </tr>
                  {open === t.id && (
                    <tr>
                      <td
                        colSpan={5}
                        className="bg-gray-50 px-10 py-2 dark:bg-gray-900/40"
                      >
                        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                          {t.responses
                            .filter((r) => r.comment)
                            .map((r) => (
                              <CommentRow key={r.id} t={t} r={r} a={a} />
                            ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Sessions with fewer than {MIN} responses rank after the rest.
      </p>
      <State log={a.log} />
    </>
  )
}

/** B — Moderation inbox. A comment feed with filters is the page; ranking is a side list. */
function VariantInbox({ talks: initial }: AdminFeedbackProps) {
  const a = useTalks(initial)
  const [filter, setFilter] = useState<'flagged' | 'all' | 'red' | 'hidden'>(
    'flagged',
  )
  const items = a.talks
    .flatMap((t) => t.responses.filter((r) => r.comment).map((r) => ({ t, r })))
    .filter(({ r }) =>
      filter === 'flagged'
        ? r.flagged
        : filter === 'red'
          ? r.colour === 'red'
          : filter === 'hidden'
            ? r.hidden
            : true,
    )
  const n = (f: typeof filter) =>
    a.talks
      .flatMap((t) => t.responses)
      .filter(
        (r) =>
          r.comment &&
          (f === 'flagged'
            ? r.flagged
            : f === 'red'
              ? r.colour === 'red'
              : f === 'hidden'
                ? r.hidden
                : true),
      ).length
  const ranked = [...a.talks].sort(
    (x, y) => share(counts(y)) - share(counts(x)),
  )
  return (
    <>
      <Header talks={a.talks} />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section className={`${panel} p-4`}>
          <div className="mb-2 flex flex-wrap gap-2">
            {(['flagged', 'all', 'red', 'hidden'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'}`}
              >
                {
                  {
                    flagged: 'Flagged',
                    all: 'All comments',
                    red: 'Not for me',
                    hidden: 'Hidden',
                  }[f]
                }{' '}
                ({n(f)})
              </button>
            ))}
          </div>
          {items.length ? (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {items.map(({ t, r }) => (
                <CommentRow key={r.id} t={t} r={r} a={a} showTalk />
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-gray-500">
              Nothing here.
            </p>
          )}
        </section>
        <aside className={`${panel} h-fit p-4`}>
          <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
            Sessions
          </h3>
          <ol className="space-y-3">
            {ranked.map((t, i) => {
              const c = counts(t)
              return (
                <li key={t.id} className="text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="truncate text-gray-800 dark:text-gray-200">
                      {i + 1}. {t.title}
                    </span>
                    <span className="shrink-0 text-xs text-gray-500">
                      {sum(c)}
                    </span>
                  </div>
                  <Bar c={c} className="mt-1 h-1.5" />
                </li>
              )
            })}
          </ol>
        </aside>
      </div>
      <State log={a.log} />
    </>
  )
}

/**
 * C — Investigate. Compact talk list on the left; the selected talk opens in a
 * detail pane = what the talk's admin page gets: totals, card entry, a
 * per-10-minute timeline (spam bursts show up), bulk remove by time window,
 * rotate code, comment moderation.
 */
function VariantDrill({ talks: initial }: AdminFeedbackProps) {
  const a = useTalks(initial)
  const [sel, setSel] = useState(initial[0].id)
  const [range, setRange] = useState<[number, number] | null>(null)
  const [rotated, setRotated] = useState(false)
  const t = a.talks.find((x) => x.id === sel)!
  const c = counts(t)
  const buckets = useMemo(() => {
    const m = new Map<string, Resp[]>()
    for (const r of t.responses) {
      const k = `${r.day} ${r.at.slice(0, 4)}0`
      m.set(k, [...(m.get(k) ?? []), r])
    }
    return [...m.entries()].sort(([x], [y]) => x.localeCompare(y))
  }, [t])
  const max = Math.max(1, ...buckets.map(([, v]) => v.length))
  const inRange = range
    ? buckets.slice(range[0], range[1] + 1).flatMap(([, v]) => v)
    : []
  return (
    <>
      <Header talks={a.talks} />
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <nav
          className={`${panel} h-fit divide-y divide-gray-100 dark:divide-gray-700`}
        >
          {a.talks.map((x) => {
            const cx = counts(x)
            const fl = x.responses.some((r) => r.flagged)
            return (
              <button
                key={x.id}
                onClick={() => {
                  setSel(x.id)
                  setRange(null)
                }}
                className={`block w-full p-3 text-left ${x.id === sel ? 'bg-blue-50 dark:bg-blue-950/40' : ''}`}
              >
                <p className="flex items-center gap-1 truncate text-sm font-medium text-gray-900 dark:text-white">
                  {fl && (
                    <FlagIcon className="size-3.5 shrink-0 text-red-600" />
                  )}
                  {x.title}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <Bar c={cx} className="h-1.5" />
                  <span className="text-xs text-gray-500">{sum(cx)}</span>
                </div>
              </button>
            )
          })}
        </nav>
        <section className="space-y-6">
          <div className={`${panel} p-5`}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t.title}
                </h2>
                <p className="text-sm text-gray-500">
                  {t.speakers} · {t.slot}
                </p>
              </div>
              <button
                onClick={() => setRotated(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium dark:border-gray-600"
                title="Retires the current code at once. Printed sheets and slides stop working; responses are kept."
              >
                <ArrowPathIcon className="size-4" /> Rotate Feedback Code
              </button>
            </div>
            {rotated && (
              <p className="mb-4 rounded bg-yellow-50 p-2 text-xs text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200">
                Confirm: <b>/f/k7m2qx stops working now</b> — printed sheets and
                slides showing it will reach a dead page. Existing responses are
                kept. <button className="underline">Rotate</button> ·{' '}
                <button className="underline" onClick={() => setRotated(false)}>
                  Cancel
                </button>
              </p>
            )}
            <Bar c={c} className="h-3" />
            <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
              {COLOURS.map((k) => (
                <div key={k}>
                  <p className="text-2xl font-bold">{c[k]}</p>
                  <p className="text-gray-500">{LABEL[k]}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                    {t.responses.filter((r) => r.colour === k).length} scanned ·
                    <input
                      defaultValue={t.cards?.[k] ?? 0}
                      className="w-12 rounded border border-gray-300 px-1 py-0.5 dark:border-gray-600 dark:bg-gray-900"
                      aria-label={`${k} cards`}
                    />{' '}
                    cards
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className={`${panel} p-5`}>
            <h3 className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
              Responses over time
            </h3>
            <p className="mb-3 text-xs text-gray-500">
              Click a bar, then another, to select a time window.
            </p>
            <div className="flex h-28 items-end gap-1">
              {buckets.map(([k, v], i) => {
                const on = range && i >= range[0] && i <= range[1]
                return (
                  <button
                    key={k}
                    title={`${k}: ${v.length}`}
                    onClick={() =>
                      setRange((r) =>
                        !r || r[0] !== r[1]
                          ? [i, i]
                          : [Math.min(r[0], i), Math.max(r[0], i)],
                      )
                    }
                    className={`flex-1 rounded-t ${on ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                    style={{ height: `${(v.length / max) * 100}%` }}
                  />
                )
              })}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-gray-500">
              <span>{buckets[0]?.[0]}</span>
              <span>{buckets.at(-1)?.[0]}</span>
            </div>
            {range && (
              <div className="mt-3 flex items-center justify-between rounded bg-gray-50 p-2 text-xs dark:bg-gray-900">
                <span>
                  {buckets[range[0]][0]}–{buckets[range[1]][0]}:{' '}
                  <b>{inRange.length}</b> responses
                </span>
                <button
                  className="inline-flex items-center gap-1 font-medium text-red-700 dark:text-red-400"
                  onClick={() => {
                    a.remove(
                      t.id,
                      inRange.map((r) => r.id),
                    )
                    setRange(null)
                  }}
                >
                  <TrashIcon className="size-4" /> Remove these {inRange.length}
                </button>
              </div>
            )}
          </div>
          <div className={`${panel} p-5`}>
            <h3 className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
              Comments
            </h3>
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {t.responses
                .filter((r) => r.comment)
                .map((r) => (
                  <CommentRow key={r.id} t={t} r={r} a={a} />
                ))}
            </ul>
          </div>
        </section>
      </div>
      <State log={a.log} />
    </>
  )
}

function State({ log }: { log: string[] }) {
  return (
    <pre className="mt-6 rounded bg-gray-100 p-2 text-[10px] text-gray-600 dark:bg-gray-900 dark:text-gray-400">
      PROTOTYPE ACTIONS{'\n'}
      {log.join('\n') || '—'}
    </pre>
  )
}

export function AdminFeedbackPrototype(props: AdminFeedbackProps) {
  const V = { A: VariantTable, B: VariantInbox, C: VariantDrill }[props.variant]
  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8 dark:bg-gray-900">
      <V {...props} />
    </div>
  )
}
