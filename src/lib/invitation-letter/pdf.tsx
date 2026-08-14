import {
  Document,
  Image,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer'
import type { InvitationLetterContent } from './content'
import { rasterizeLogoToPngDataUrl } from '@/lib/sponsor-crm/logo-raster'

// Same palette as the sponsor contract PDF, so the two documents an organizer
// sends out look like they come from the same organization.
const BRAND_BLUE = '#1D4ED8'
const TEXT_PRIMARY = '#1E293B'
const TEXT_SECONDARY = '#475569'
const TEXT_MUTED = '#94A3B8'
const BORDER_COLOR = '#E2E8F0'

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    lineHeight: 1.4,
    color: TEXT_PRIMARY,
    paddingTop: 42,
    paddingBottom: 52,
    paddingHorizontal: 55,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
    paddingBottom: 12,
    marginBottom: 16,
  },
  logo: { width: 110, maxHeight: 38, objectFit: 'contain' },
  organizerLine: { fontSize: 9, color: TEXT_SECONDARY, textAlign: 'right' },
  organizerName: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: TEXT_PRIMARY,
    textAlign: 'right',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  meta: { fontSize: 9, color: TEXT_SECONDARY },
  addressee: { marginBottom: 14, fontSize: 10 },
  subject: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: BRAND_BLUE,
    marginBottom: 12,
  },
  paragraph: { marginBottom: 8, textAlign: 'justify' },
  tableHeading: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: TEXT_MUTED,
    marginBottom: 4,
  },
  table: {
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    borderRadius: 3,
    marginBottom: 12,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
  },
  tableRowLast: { flexDirection: 'row' },
  tableLabel: {
    width: '38%',
    padding: 5,
    fontSize: 9,
    color: TEXT_SECONDARY,
  },
  tableValue: {
    width: '62%',
    padding: 5,
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
  },
  // The programme block. Deliberately NOT a label/value table: a consular
  // officer is reading this as the stated purpose of the visit, so each session
  // leads with its title at body weight and carries the schedule beneath it,
  // rather than hiding the title in the right-hand column of a detail grid.
  sessionsIntro: {
    fontSize: 9,
    color: TEXT_SECONDARY,
    marginBottom: 5,
  },
  sessionRow: {
    padding: 6,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
  },
  sessionRowLast: { padding: 6 },
  sessionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  sessionSchedule: { fontSize: 9, color: TEXT_SECONDARY, marginTop: 2 },
  signatureBlock: { marginTop: 14 },
  signatureImage: { width: 130, maxHeight: 46, objectFit: 'contain' },
  signatureRule: {
    borderTopWidth: 1,
    borderTopColor: BORDER_COLOR,
    width: 200,
    marginTop: 6,
    paddingTop: 6,
  },
  signatoryName: { fontFamily: 'Helvetica-Bold', fontSize: 10 },
  signatoryDetail: { fontSize: 9, color: TEXT_SECONDARY },
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 55,
    right: 55,
    borderTopWidth: 1,
    borderTopColor: BORDER_COLOR,
    paddingTop: 8,
    fontSize: 8,
    color: TEXT_MUTED,
    textAlign: 'center',
  },
})

function DetailTable({
  heading,
  rows,
}: {
  heading: string
  rows: Array<{ label: string; value: string }>
}) {
  return (
    <View wrap={false}>
      <Text style={styles.tableHeading}>{heading}</Text>
      <View style={styles.table}>
        {rows.map((row, index) => (
          <View
            key={row.label}
            style={
              index === rows.length - 1 ? styles.tableRowLast : styles.tableRow
            }
          >
            <Text style={styles.tableLabel}>{row.label}</Text>
            <Text style={styles.tableValue}>{row.value}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

/**
 * The confirmed programme sessions.
 *
 * Renders NOTHING at all when there are none — no heading, no empty box — so a
 * letter for an attendee is the letter it was before this block existed. Same
 * for a session with no schedule: the title stands alone, and the `&&` is
 * load-bearing because an unconditional `<Text>{undefined}</Text>` draws no
 * characters but still lays out a blank line and pushes the rest of the letter
 * down (asserted in `pdf.test.ts` by geometry, not by wording).
 */
function ProgrammeBlock({ content }: { content: InvitationLetterContent }) {
  if (content.sessions.length === 0) return null

  return (
    <View wrap={false}>
      {/* Deliberately not just "Programme": the Event table above already
          carries a "Programme" row linking the whole schedule, and two things
          under one word on a document read by a stranger is a defect. */}
      <Text style={styles.tableHeading}>Programme contribution</Text>
      {content.sessionsIntro && (
        <Text style={styles.sessionsIntro}>{content.sessionsIntro}</Text>
      )}
      <View style={styles.table}>
        {content.sessions.map((session, index) => (
          // Index in the key as well as the title: the same talk can appear
          // twice (a repeated session), and two identical keys is a latent
          // reconciliation bug even where a one-shot render survives it.
          <View
            key={`${index}-${session.title}`}
            style={
              index === content.sessions.length - 1
                ? styles.sessionRowLast
                : styles.sessionRow
            }
          >
            <Text style={styles.sessionTitle}>{session.title}</Text>
            {session.schedule && (
              <Text style={styles.sessionSchedule}>{session.schedule}</Text>
            )}
          </View>
        ))}
      </View>
    </View>
  )
}

export function InvitationLetterDocument({
  content,
  logoDataUrl,
}: {
  content: InvitationLetterContent
  logoDataUrl?: string
}) {
  const [organizerName, ...organizerRest] = content.organizerLines

  return (
    <Document
      title={content.subject}
      author={organizerName}
      subject="Letter of invitation"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {logoDataUrl ? (
            <Image src={logoDataUrl} style={styles.logo} />
          ) : (
            <Text style={styles.organizerName}>{organizerName}</Text>
          )}
          <View>
            {logoDataUrl && (
              <Text style={styles.organizerName}>{organizerName}</Text>
            )}
            {organizerRest.map((line) => (
              <Text key={line} style={styles.organizerLine}>
                {line}
              </Text>
            ))}
          </View>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.meta}>Reference: {content.reference}</Text>
          <Text style={styles.meta}>{content.issuedOn}</Text>
        </View>

        <Text style={styles.addressee}>{content.addressedTo},</Text>
        <Text style={styles.subject}>{content.subject}</Text>

        {content.paragraphs.slice(0, 1).map((paragraph, index) => (
          <Text key={index} style={styles.paragraph}>
            {paragraph}
          </Text>
        ))}

        <DetailTable heading="Applicant" rows={content.applicantRows} />
        <DetailTable heading="Event" rows={content.eventRows} />
        {/* Directly under the event facts, before the stay and cost
            paragraphs: it answers "why is this person travelling", which is
            what the officer is reading for, and it inherits the context of the
            event table immediately above it. */}
        <ProgrammeBlock content={content} />

        {content.paragraphs.slice(1, -1).map((paragraph, index) => (
          <Text key={index} style={styles.paragraph}>
            {paragraph}
          </Text>
        ))}

        {/* The closing and the signature travel together: a signature stranded
            alone on a second page reads as an afterthought on a document whose
            whole purpose is to look official. */}
        <View wrap={false}>
          <Text style={styles.paragraph}>
            {content.paragraphs[content.paragraphs.length - 1]}
          </Text>
          <View style={styles.signatureBlock}>
            <Text style={styles.paragraph}>Yours sincerely,</Text>
            {content.signatory.signatureDataUrl && (
              <Image
                src={content.signatory.signatureDataUrl}
                style={styles.signatureImage}
              />
            )}
            <View style={styles.signatureRule}>
              <Text style={styles.signatoryName}>{content.signatory.name}</Text>
              {content.signatory.title && (
                <Text style={styles.signatoryDetail}>
                  {content.signatory.title}
                </Text>
              )}
              <Text style={styles.signatoryDetail}>{organizerName}</Text>
              {content.signatory.email && (
                <Text style={styles.signatoryDetail}>
                  {content.signatory.email}
                </Text>
              )}
            </View>
          </View>
        </View>

        <Text style={styles.footer} fixed>
          {content.reference} · Issued {content.issuedOn} · This letter supports
          a visa application and is not a guarantee of entry.
        </Text>
      </Page>
    </Document>
  )
}

/** Renders the letter to a PDF buffer. */
export async function generateInvitationLetterPdf(
  content: InvitationLetterContent,
  conferenceLogo?: string,
): Promise<Buffer> {
  // Never fail letter generation on a logo problem — the helper logs and
  // returns undefined, and the document falls back to a text letterhead.
  const logoDataUrl = rasterizeLogoToPngDataUrl(conferenceLogo, {
    logTag: 'invitation-letter',
  })
  const buffer = await renderToBuffer(
    <InvitationLetterDocument content={content} logoDataUrl={logoDataUrl} />,
  )
  return Buffer.from(buffer)
}
