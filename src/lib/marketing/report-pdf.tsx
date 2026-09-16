import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Svg,
  Line,
  Path,
  Circle,
  Rect,
  renderToBuffer,
} from '@react-pdf/renderer'
import type { ReportView } from './report/types'
import { OUTCOME_LABELS } from './types'
import { formatDateSafe } from '@/lib/time'
import {
  pct,
  campaignBand,
  MILESTONE_LABELS,
} from '@/components/admin/marketing/timeline-model'
import type { Milestone } from './milestones'

const styles = StyleSheet.create({
  page: {
    padding: 38,
    paddingBottom: 48,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#172554',
    lineHeight: 1.3,
  },
  title: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 23,
    lineHeight: 1.2,
    marginBottom: 12,
  },
  subtitle: { color: '#475569', fontSize: 10, marginBottom: 12 },
  section: {
    marginTop: 12,
    marginBottom: 7,
    fontFamily: 'Helvetica-Bold',
    fontSize: 14,
  },
  note: { color: '#475569', fontSize: 8, marginBottom: 8 },
  row: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#cbd5e1',
    paddingVertical: 6,
  },
  bold: { fontFamily: 'Helvetica-Bold' },
  chart: { marginTop: 10, marginBottom: 10 },
  footer: {
    position: 'absolute',
    bottom: 22,
    height: 12,
    lineHeight: 1.2,
    left: 38,
    right: 38,
    color: '#64748b',
    fontSize: 8,
  },
})
const number = (value: number | null) => (value === null ? '-' : String(value))

function Health({ report }: { report: ReportView }) {
  const h = report.health
  return (
    <View wrap={false}>
      <Text style={styles.section} minPresenceAhead={45}>
        Plan health
      </Text>
      <Text>
        {h.complete} complete / {h.total} Tasks; {h.overdue} overdue;{' '}
        {h.waiting} waiting; {h.failed} failed; {h.unassigned} unassigned.
      </Text>
      <Text style={styles.note}>
        Health reflects current Tasks. Counts can overlap. Plan is{' '}
        {h.running ? 'running' : 'finished'}.
      </Text>
    </View>
  )
}

function Timeline({ report }: { report: ReportView }) {
  const range = {
    start: Date.parse(`${report.range.from}T12:00:00Z`),
    end: Date.parse(`${report.range.to}T12:00:00Z`),
  }
  const width = 510
  const height = 80
  const milestones = Object.entries(report.milestones).filter(
    ([, value]) =>
      value &&
      Date.parse(`${value.date}T12:00:00Z`) >= range.start &&
      Date.parse(`${value.date}T12:00:00Z`) < range.end,
  )
  return (
    <View>
      <Text style={styles.section} minPresenceAhead={45}>
        Timeline curve
      </Text>
      <Text style={styles.note}>
        {report.range.grain === 'weekly'
          ? 'Weekly last observations'
          : 'Daily observations'}
        . Each Campaign has its own Outcome scale. Hollow points retain an
        earlier measured observation when a source was unavailable.
      </Text>
      {report.timeline.length === 0 && (
        <Text>No Snapshot observations in this range.</Text>
      )}
      {report.timeline.map((series) => {
        const maximum = Math.max(
          1,
          ...series.points.map((point) => point.value ?? 0),
        )
        let penDown = false
        const path = series.points
          .map((point) => {
            if (point.value === null) {
              penDown = false
              return ''
            }
            const segment = `${penDown ? 'L' : 'M'} ${(pct(point.date, range) * width) / 100} ${height - (point.value / maximum) * (height - 10)}`
            penDown = true
            return segment
          })
          .join(' ')
        const campaign = report.campaigns.find(
          (item) => item._id === series.campaignId,
        )
        const band = campaign ? campaignBand(campaign, [], range) : null
        return (
          <View key={series.campaignId} style={styles.chart} wrap={false}>
            <Text style={styles.bold}>
              {series.title} - {OUTCOME_LABELS[series.outcome]}
            </Text>
            <Text style={styles.note}>
              Scale: 0 to {maximum}. Latest plotted observation:{' '}
              {number(series.points.at(-1)?.value ?? null)}.
            </Text>
            <Svg
              width={width}
              height={height + 14}
              viewBox={`0 0 ${width} ${height + 14}`}
            >
              {band && (
                <Rect
                  x={(band.left * width) / 100}
                  y={0}
                  width={Math.min(
                    (band.width * width) / 100,
                    width - (band.left * width) / 100,
                  )}
                  height={height}
                  fill="#eff6ff"
                />
              )}
              <Line
                x1={0}
                y1={height}
                x2={width}
                y2={height}
                stroke="#94a3b8"
                strokeWidth={1}
              />
              {milestones.map(([key, value]) => (
                <Line
                  key={key}
                  x1={(pct(value!.date, range) * width) / 100}
                  x2={(pct(value!.date, range) * width) / 100}
                  y1={0}
                  y2={height}
                  stroke="#cbd5e1"
                  strokeWidth={1}
                />
              ))}
              {path.trim() && (
                <Path d={path} fill="none" stroke="#2563eb" strokeWidth={1.5} />
              )}
              {series.points
                .filter((point) => point.value !== null)
                .map((point) => (
                  <Circle
                    key={point.date}
                    cx={(pct(point.date, range) * width) / 100}
                    cy={height - (point.value! / maximum) * (height - 10)}
                    r={2.5}
                    fill={point.stale ? '#ffffff' : '#2563eb'}
                    stroke="#2563eb"
                    strokeWidth={1}
                  />
                ))}
            </Svg>
            <Text style={styles.note}>
              {formatDateSafe(report.range.from)} to{' '}
              {formatDateSafe(report.range.to)} (exclusive). Blue shade:
              Campaign window
              {campaign
                ? `, ${formatDateSafe(campaign.startDate)} to ${formatDateSafe(campaign.endDate)}`
                : ''}
              .
            </Text>
          </View>
        )
      })}
      {milestones.length > 0 && (
        <Text style={styles.note}>
          Milestones:{' '}
          {milestones
            .map(
              ([key, value]) =>
                `${MILESTONE_LABELS[key as Milestone]} ${formatDateSafe(value!.date)}${value!.provisional ? ' (provisional)' : ''}`,
            )
            .join('; ')}
          .
        </Text>
      )}
    </View>
  )
}

export function MarketingReportDocument({ report }: { report: ReportView }) {
  return (
    <Document
      title={`${report.conference.title} - Marketing Report`}
      author={report.conference.title}
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Marketing Report</Text>
        <Text style={styles.subtitle}>{report.conference.title}</Text>
        <Text style={styles.note}>
          {formatDateSafe(report.range.from)} to{' '}
          {formatDateSafe(report.range.to)} (exclusive) | {report.range.grain}{' '}
          grain
        </Text>
        <Text style={styles.note}>
          {report.semantics} A dash means not measured, never zero.
        </Text>
        {!report.plan && (
          <Text>No Marketing Plan exists for this edition.</Text>
        )}
        {report.health.running && <Health report={report} />}
        <Text style={styles.section} minPresenceAhead={45}>
          Outcome vs Target
        </Text>
        {report.summary.length === 0 && <Text>No Campaigns to report.</Text>}
        {report.summary.map((campaign) => (
          <View key={campaign._id} style={styles.row} wrap={false}>
            <Text style={styles.bold}>{campaign.title}</Text>
            <Text>
              {OUTCOME_LABELS[campaign.primaryOutcome]}:{' '}
              {number(campaign.value)} / Target: {number(campaign.target)}
            </Text>
            {campaign.attributedValue !== null && (
              <Text>Attributed subset: {campaign.attributedValue}</Text>
            )}
            <Text style={styles.note}>
              Observed:{' '}
              {campaign.observationDate
                ? formatDateSafe(campaign.observationDate)
                : '-'}
              {campaign.stale
                ? ' (last measured observation; may be stale)'
                : ''}
              {campaign.primaryOutcome === 'ticketsSoldInWindow'
                ? '. In window, not attributed.'
                : ''}
            </Text>
          </View>
        ))}
        <Text style={styles.section} minPresenceAhead={45}>
          Edition funnel by Channel
        </Text>
        <Text style={styles.note}>{report.unavailableStage}</Text>
        {report.channels.length === 0 && (
          <Text>No Channel observations available.</Text>
        )}
        {report.channels.map((channel) => (
          <Text key={channel.channel} style={styles.row}>
            {channel.channel}: Sessions {number(channel.sessions)}; combined
            CFP, sponsor and checkout clicks {number(channel.clicks)}
          </Text>
        ))}
        <Timeline report={report} />
        <Text style={styles.section} minPresenceAhead={45}>
          Top ten Tasks
        </Text>
        <Text style={styles.note}>{report.rankingMetric}</Text>
        {report.topTasks.length === 0 && (
          <Text>No measured Tasks to rank.</Text>
        )}
        {report.topTasks.map((task, index) => (
          <View key={task.taskId} style={styles.row} wrap={false}>
            <Text style={styles.bold}>
              {index + 1}. {task.title}
            </Text>
            <Text>
              {task.campaignTitle} | {task.channel ?? 'Unknown Channel'}
            </Text>
            <Text>
              Combined clicks: {number(task.clicks)} | Sessions:{' '}
              {number(task.sessions)} | Bluesky interactions:{' '}
              {number(task.blueskyInteractions)}
            </Text>
          </View>
        ))}
        <Text style={styles.section} minPresenceAhead={45}>
          Previous-edition comparison
        </Text>
        {report.previousEdition ? (
          <View>
            <Text style={styles.note}>{report.previousEdition.title}</Text>
            {report.previousEdition.campaigns.map((campaign) => (
              <View key={campaign.key} style={styles.row} wrap={false}>
                <Text style={styles.bold}>{campaign.title}</Text>
                <Text>
                  {campaign.comparable
                    ? `Current: ${number(campaign.current)} | Previous: ${number(campaign.previous)}`
                    : `Not comparable: ${campaign.reason ?? 'Outcome or window differs'}`}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text>No previous edition is available for comparison.</Text>
        )}
        {!report.health.running && <Health report={report} />}
        <Text style={styles.footer} fixed>
          {report.conference.title} | Marketing Report
        </Text>
      </Page>
    </Document>
  )
}

/** The page and export consume exactly the same stored-observation ReportView. */
export function renderMarketingReportPdf(report: ReportView): Promise<Buffer> {
  return renderToBuffer(<MarketingReportDocument report={report} />)
}
