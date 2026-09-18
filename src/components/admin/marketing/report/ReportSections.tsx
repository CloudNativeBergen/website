import type { ReactNode } from 'react'
import Link from 'next/link'
import type { ReportView } from '@/lib/marketing/report/types'
import { OUTCOME_LABELS } from '@/lib/marketing/types'
import { formatChartDateShort, HOUSE_LOCALE } from '@/lib/time'
import type { Milestone } from '@/lib/marketing/milestones'
import {
  campaignBand,
  MILESTONE_LABELS,
  pct,
  toMs,
  packMilestones,
  timelineRange,
} from '../timeline-model'

const number = (value: number | null) =>
  value === null ? '—' : value.toLocaleString(HOUSE_LOCALE)
function measurementLabel(
  measurement: ReportView['topTasks'][number]['sessionsMeasurement'],
  aggregate = false,
) {
  if (measurement.observationDate === null) return 'Not measured'
  return `${
    measurement.observationDate
      ? `${aggregate ? 'Oldest measurement:' : 'Observed'} ${formatChartDateShort(measurement.observationDate)}`
      : 'Not measured'
  }${measurement.stale ? ' · last measured reading retained' : ''}`
}
/** The Outcome the live Campaign carries now, when a reading measured another. */
function liveOutcome(view: ReportView, campaignId: string) {
  return (
    view.campaigns.find((c) => c._id === campaignId)?.primaryOutcome ?? null
  )
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 sm:p-6 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
        {title}
      </h2>
      {children}
    </section>
  )
}
const note = 'text-sm leading-relaxed text-gray-500 dark:text-gray-400'
const row = 'border-t border-gray-100 py-3 dark:border-gray-800'

export function OutcomeSummary({ view }: { view: ReportView }) {
  return (
    <Section title="Outcome vs Target">
      <p className={note}>{view.semantics}</p>
      {!view.summary.length && (
        <p className="mt-4 text-sm">No Campaigns in this plan yet.</p>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {view.summary.map((c) => (
          <div
            key={c._id}
            className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800"
          >
            <Link
              href={`/admin/marketing/campaigns/${c._id}`}
              className="font-medium text-brand-cloud-blue dark:text-blue-300"
            >
              {c.title}
            </Link>
            <p className={`mt-1 ${note}`}>{OUTCOME_LABELS[c.primaryOutcome]}</p>
            <p className="mt-3 text-2xl font-semibold tabular-nums">
              {number(c.value)}{' '}
              <span className="text-sm font-normal text-gray-500">
                / {number(c.target)} target
              </span>
            </p>
            {/* The figure, its metric and its target all describe the stored
                reading. Say so, or the card looks like today's state of a
                Campaign that now measures something else entirely. */}
            {c.outcomeChanged && (
              <p className={`mt-2 ${note}`}>
                {`Measured before the Outcome changed${
                  liveOutcome(view, c._id)
                    ? ` to ${OUTCOME_LABELS[liveOutcome(view, c._id)!]}`
                    : ''
                } — tonight's run measures the new one`}
              </p>
            )}
            {/* `measurementLabel`, not an inlined copy of it: the inlined one
                appended the stale suffix unconditionally and rendered the
                self-contradicting "Not measured · last measured reading
                retained" whenever nothing had ever been measured. */}
            <p className={`mt-2 ${note}`}>
              {measurementLabel({
                observationDate: c.observationDate,
                stale: c.stale,
              })}
            </p>
            {c.primaryOutcome === 'ticketsSoldInWindow' && (
              <p className={note}>In window, not attributed</p>
            )}
            {c.attributedValue !== null && (
              <p className={note}>
                {number(c.attributedValue)} tagged submissions
              </p>
            )}
          </div>
        ))}
      </div>
    </Section>
  )
}
export function CampaignBreakdown({ view }: { view: ReportView }) {
  const retired = view.breakdown?.filter((c) => c.retired) ?? []
  if (!retired.length) return null
  return (
    <Section title="Retired Campaigns">
      <p className={note}>
        Preserved measurements. Retired Campaigns are excluded from headline
        totals, timeline and Task rankings.
      </p>
      {retired.map((c) => (
        <div key={c.key} className={row}>
          <h3 className="font-medium">{c.title} · Retired</h3>
          <p className={note}>{OUTCOME_LABELS[c.primaryOutcome]}</p>
          <p className="mt-2 tabular-nums">
            {number(c.value)} / {number(c.target)} target
          </p>
          <p className={note}>
            {c.observationDate
              ? `Observed ${formatChartDateShort(c.observationDate)}`
              : 'Not measured'}
          </p>
        </div>
      ))}
    </Section>
  )
}
export function ChannelFunnel({ view }: { view: ReportView }) {
  return (
    <Section title="Edition funnel by Channel">
      <p className={note}>
        Stored Task observations: sessions and combined CFP, sponsor and
        checkout clicks.
      </p>
      {view.channels.map((c) => (
        <div key={c.channel} className={`mt-3 ${row}`}>
          <h3 className="font-medium capitalize">{c.channel}</h3>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div className="rounded-md bg-blue-50 p-3 dark:bg-blue-950">
              <p className="text-xl font-semibold tabular-nums">
                {number(c.sessions)}
              </p>
              <p className={note}>Sessions</p>
              <p className={note}>
                {measurementLabel(c.sessionsMeasurement, true)}
              </p>
            </div>
            <div className="rounded-md bg-teal-50 p-3 dark:bg-teal-950">
              <p className="text-xl font-semibold tabular-nums">
                {number(c.clicks)}
              </p>
              <p className={note}>Combined clicks</p>
              <p className={note}>
                {measurementLabel(c.clicksMeasurement, true)}
              </p>
            </div>
          </div>
        </div>
      ))}
      {!view.channels.length && (
        <p className="my-4 text-sm">No Channel observations.</p>
      )}
      <p className={`mt-4 ${note}`}>{view.unavailableStage}</p>
    </Section>
  )
}
export function ReportTimeline({ view }: { view: ReportView }) {
  const planRange = timelineRange({
    campaigns: view.campaigns,
    tasks: view.tasks,
    milestones: view.milestones,
    today: view.range.from,
  })
  const range = {
    start: Number.isFinite(toMs(view.range.from))
      ? toMs(view.range.from)
      : planRange.start,
    end: Number.isFinite(toMs(view.range.to))
      ? toMs(view.range.to)
      : planRange.end,
  }
  const markers = Object.entries(view.milestones).filter(
    ([, m]) =>
      m !== undefined &&
      toMs(m.date) >= range.start &&
      toMs(m.date) < range.end,
  )
  const markerRows = packMilestones(Object.fromEntries(markers), range)
  const axisY = 180 + (markerRows.rows - 1) * 20
  const x = (date: string) => 38 + pct(date, range) * 2.84
  return (
    <Section title="Timeline curve">
      <p className={note}>
        Cumulative observations by Campaign · {view.range.grain}. Each chart has
        its own Outcome scale. Hollow points retain the last measured reading; a
        dash means not measured.
      </p>
      {!view.timeline.length && (
        <p className="mt-4 text-sm">No stored observations in this range.</p>
      )}
      {view.timeline.map((series, seriesIndex) => {
        if (series.points.length === 0)
          return (
            <div key={`${series.campaignId}:${seriesIndex}`} className="mt-5">
              <h3 className="font-medium">{series.title}</h3>
              <p className={note}>No stored observations in this range.</p>
            </div>
          )
        const max = Math.max(1, ...series.points.map((p) => p.value ?? 0))
        const y = (value: number) => 132 - (value / max) * 104
        let open = false
        const path = series.points
          .map((p) => {
            if (p.value === null) {
              open = false
              return ''
            }
            const segment = `${open ? 'L' : 'M'} ${x(p.date)} ${y(p.value)}`
            open = true
            return segment
          })
          .join(' ')
        const campaign = view.campaigns.find((c) => c._id === series.campaignId)
        const band = campaign ? campaignBand(campaign, [], range) : null
        return (
          <div key={`${series.campaignId}:${seriesIndex}`} className="mt-5">
            <h3 className="font-medium">{series.title}</h3>
            <p className={note}>{OUTCOME_LABELS[series.outcome]}</p>
            {series.metricChanged && (
              <p className={note}>
                Outcome changed — measurements restart here.
              </p>
            )}
            {series.windowChanged && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Campaign window changed — measurements restart here.
              </p>
            )}
            <svg
              viewBox={`0 0 340 ${axisY + 4}`}
              role="img"
              aria-label={`${series.title}: ${OUTCOME_LABELS[series.outcome]}, cumulative observations`}
              className="mt-2 w-full max-w-3xl text-gray-500"
            >
              <title>{series.title} cumulative observations</title>
              {[0, max / 2, max].map((v) => (
                <g key={v}>
                  <line
                    x1="38"
                    x2="322"
                    y1={y(v)}
                    y2={y(v)}
                    stroke="currentColor"
                    strokeOpacity="0.15"
                  />
                  <text
                    x="32"
                    y={y(v) + 4}
                    textAnchor="end"
                    fontSize="10"
                    fill="currentColor"
                  >
                    {number(Math.round(v))}
                  </text>
                </g>
              ))}
              {band && (
                <rect
                  x={38 + band.left * 2.84}
                  y="22"
                  width={band.width * 2.84}
                  height="110"
                  fill="#3b82f6"
                  opacity="0.07"
                />
              )}
              {markers.map(([id, m], i) => (
                <g key={id}>
                  <line
                    x1={x(m!.date)}
                    x2={x(m!.date)}
                    y1="20"
                    y2="145"
                    stroke="#94a3b8"
                    strokeDasharray="3 4"
                  />
                  <circle
                    cx={x(m!.date)}
                    cy={153 + (markerRows.rowOf.get(id) ?? 0) * 20}
                    r="8"
                    className="fill-white stroke-gray-300 dark:fill-gray-900 dark:stroke-gray-600"
                  />
                  <text
                    x={x(m!.date)}
                    y={156 + (markerRows.rowOf.get(id) ?? 0) * 20}
                    textAnchor="middle"
                    fontSize="9"
                    fill="currentColor"
                  >
                    {i + 1}
                  </text>
                </g>
              ))}
              <path
                d={path}
                fill="none"
                stroke="#2563eb"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              {series.points
                .filter((p) => p.value !== null)
                .map((p) => (
                  <circle
                    key={p.date}
                    cx={x(p.date)}
                    cy={y(p.value!)}
                    r="3"
                    fill={p.stale ? 'white' : '#2563eb'}
                    stroke="#2563eb"
                  >
                    <title>
                      {formatChartDateShort(p.date)}: {number(p.value)}
                      {p.stale ? ' (last measured)' : ''}
                    </title>
                  </circle>
                ))}
              <text x="38" y={axisY} fontSize="10" fill="currentColor">
                {formatChartDateShort(view.range.from)}
              </text>
              <text
                x="322"
                y={axisY}
                textAnchor="end"
                fontSize="10"
                fill="currentColor"
              >
                Before {formatChartDateShort(view.range.to)}
              </text>
            </svg>
            {series.points.length > 0 &&
              series.points.every((p) => p.value === null) && (
                <p className={note}>— Not measured: source unavailable.</p>
              )}
          </div>
        )
      })}
      {view.campaigns.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium">Campaign windows</h3>
          {view.campaigns.map((c) => {
            const band = campaignBand(c, [], range)
            return (
              <div key={c._id} className="mt-2">
                <p className={note}>
                  {c.title} · {formatChartDateShort(c.startDate)} –{' '}
                  {formatChartDateShort(c.endDate)}
                </p>
                <div className="relative mt-1 h-2 rounded bg-gray-100 dark:bg-gray-800">
                  <span
                    className="absolute h-2 rounded bg-blue-400"
                    style={{ left: `${band.left}%`, width: `${band.width}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
      {markers.length > 0 && (
        <ol className="mt-4 grid gap-1 text-xs text-gray-500 sm:grid-cols-2">
          {markers.map(([id, m], i) => (
            <li key={id}>
              {i + 1}. {MILESTONE_LABELS[id as Milestone]} ·{' '}
              {formatChartDateShort(m!.date)}
              {m!.provisional ? ' (provisional)' : ''}
            </li>
          ))}
        </ol>
      )}
    </Section>
  )
}
export function TopTasks({ view }: { view: ReportView }) {
  return (
    <Section title="Top ten Tasks">
      <p className={note}>{view.rankingMetric}</p>
      {!view.topTasks.length && (
        <p className="mt-4 text-sm">No measured Tasks in this range.</p>
      )}
      <ol className="mt-3">
        {view.topTasks.map((t, i) => (
          <li key={`${t.campaignId}:${t.taskId}`} className={row}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/admin/marketing/tasks/${t.taskId}`}
                  className="font-medium text-brand-cloud-blue dark:text-blue-300"
                >
                  {i + 1}. {t.title}
                </Link>
                <p className={note}>
                  {t.campaignTitle} · {t.channel ?? 'Unknown Channel'}
                </p>
              </div>
            </div>
            <p className={`mt-1 ${note}`}>
              Combined clicks: {number(t.clicks)} ·{' '}
              {measurementLabel(t.clicksMeasurement)}
            </p>
            <p className={note}>
              Sessions: {number(t.sessions)} ·{' '}
              {measurementLabel(t.sessionsMeasurement)}
            </p>
            <p className={note}>
              Bluesky interactions: {number(t.blueskyInteractions)} ·{' '}
              {measurementLabel(t.blueskyInteractionsMeasurement, true)}
            </p>
          </li>
        ))}
      </ol>
    </Section>
  )
}
export function PreviousEdition({ view }: { view: ReportView }) {
  return (
    <Section title="Previous-edition comparison">
      {!view.previousEdition ? (
        <p className={note}>
          No previous edition with a marketing plan is available.
        </p>
      ) : (
        <>
          <p className={note}>
            {view.previousEdition.title}. Only matching Outcomes and comparable
            windows are compared.
          </p>
          {view.previousEdition.campaigns.map((c) => (
            <div className={row} key={c.key}>
              <h3 className="font-medium">{c.title}</h3>
              {c.comparable ? (
                <p className="mt-1 tabular-nums">
                  {number(c.current)} current · {number(c.previous)} previous
                </p>
              ) : (
                <p className={`mt-1 ${note}`}>Not comparable: {c.reason}</p>
              )}
            </div>
          ))}
        </>
      )}
    </Section>
  )
}
export function PlanHealth({ view }: { view: ReportView }) {
  const h = view.health
  return (
    <Section title="Plan health">
      <p className={note}>
        {!view.plan
          ? 'No marketing plan yet.'
          : h.running
            ? 'Plan is running. Resolve outstanding work while Campaigns are active.'
            : 'Plan has ended. Final work status.'}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          ['Complete', `${number(h.complete)}/${number(h.total)}`],
          ['Overdue', number(h.overdue)],
          ['Waiting', number(h.waiting)],
          ['Failed', number(h.failed)],
          ['Unassigned', number(h.unassigned)],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800"
          >
            <dt className={note}>{label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <p className={`mt-3 ${note}`}>
        States can overlap: a Task can be both waiting and overdue.
      </p>
    </Section>
  )
}
export function ReportSections({ view }: { view: ReportView }) {
  return (
    <div className="space-y-6 text-gray-900 dark:text-gray-100">
      {view.health.running && <PlanHealth view={view} />}
      <OutcomeSummary view={view} />
      <CampaignBreakdown view={view} />
      <ChannelFunnel view={view} />
      <ReportTimeline view={view} />
      <TopTasks view={view} />
      <PreviousEdition view={view} />
      {!view.health.running && <PlanHealth view={view} />}
    </div>
  )
}
