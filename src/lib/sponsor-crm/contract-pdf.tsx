import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer'
import type { ContractTemplate } from './contract-templates'
import {
  buildContractVariables,
  processTemplateVariables,
  type ContractVariableContext,
} from './contract-variables'
import type { PortableTextBlock } from '@/lib/sponsor/types'

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 11,
    paddingTop: 60,
    paddingBottom: 60,
    paddingHorizontal: 50,
    lineHeight: 1.5,
  },
  header: {
    fontSize: 9,
    color: '#666',
    marginBottom: 30,
    textAlign: 'center',
  },
  title: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  sectionHeading: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    marginTop: 16,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 11,
    marginBottom: 8,
  },
  bold: {
    fontFamily: 'Helvetica-Bold',
  },
  italic: {
    fontStyle: 'italic',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 50,
    right: 50,
    fontSize: 8,
    color: '#999',
    textAlign: 'center',
  },
  signatureArea: {
    marginTop: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signatureBlock: {
    width: '45%',
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    marginTop: 40,
    marginBottom: 4,
  },
  signatureLabel: {
    fontSize: 9,
    color: '#666',
  },
  // Info table styles
  infoTable: {
    flexDirection: 'row',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  infoColumn: {
    flex: 1,
    padding: 12,
  },
  infoColumnLeft: {
    borderRightWidth: 1,
    borderRightColor: '#ccc',
  },
  infoColumnHeader: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#555',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  infoLabel: {
    fontSize: 9,
    color: '#666',
    width: 70,
  },
  infoValue: {
    fontSize: 10,
    flex: 1,
  },
  // Details section styles
  detailsSection: {
    marginBottom: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  detailsHeading: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  detailLabel: {
    fontSize: 10,
    color: '#555',
    width: 140,
  },
  detailValue: {
    fontSize: 10,
    flex: 1,
    fontFamily: 'Helvetica-Bold',
  },
  // Appendix styles
  appendixTitle: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  termsHeading: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    marginTop: 14,
    marginBottom: 6,
  },
})

function renderPortableTextToElements(
  blocks: PortableTextBlock[],
  variables: Record<string, string>,
  options?: { headingStyle?: (typeof styles)[keyof typeof styles] },
): React.ReactElement[] {
  const elements: React.ReactElement[] = []
  const headingStyle = options?.headingStyle || styles.sectionHeading

  // Track numbering for ordered lists
  let listCounter = 0
  let inList = false

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]

    if (block._type === 'block' && Array.isArray(block.children)) {
      const children: React.ReactElement[] = []

      for (let j = 0; j < block.children.length; j++) {
        const child = block.children[j]
        if (child._type === 'span' && typeof child.text === 'string') {
          const text = processTemplateVariables(child.text, variables)
          const marks = child.marks || []

          let style = {}
          if (marks.includes('strong')) {
            style = { ...style, ...styles.bold }
          }
          if (marks.includes('em')) {
            style = { ...style, ...styles.italic }
          }

          children.push(
            <Text key={`span-${i}-${j}`} style={style}>
              {text}
            </Text>,
          )
        }
      }

      // Handle headings (h2, h3, h4)
      if (
        block.style === 'h2' ||
        block.style === 'h3' ||
        block.style === 'h4'
      ) {
        elements.push(
          <Text key={`block-${i}`} style={headingStyle}>
            {children}
          </Text>,
        )
        inList = false
        listCounter = 0
        continue
      }

      const isBullet = block.listItem === 'bullet'
      const isNumbered = block.listItem === 'number'

      if (isBullet || isNumbered) {
        if (!inList || (isNumbered && !inList)) {
          listCounter = 0
        }
        inList = true
        if (isNumbered) listCounter++
        const prefix = isBullet ? '\u2022  ' : `${listCounter}.  `
        elements.push(
          <View
            key={`block-${i}`}
            style={{ flexDirection: 'row', marginBottom: 4, paddingLeft: 16 }}
          >
            <Text style={{ width: 20 }}>{prefix}</Text>
            <Text style={[styles.paragraph, { flex: 1, marginBottom: 0 }]}>
              {children}
            </Text>
          </View>,
        )
      } else {
        inList = false
        listCounter = 0
        elements.push(
          <Text key={`block-${i}`} style={styles.paragraph}>
            {children}
          </Text>,
        )
      }
    }
  }

  return elements
}

interface InfoTableProps {
  variables: Record<string, string>
}

function InfoTable({ variables }: InfoTableProps) {
  const orgRows = [
    { label: 'Name', value: variables.ORG_NAME },
    { label: 'Org. No.', value: variables.ORG_ORG_NUMBER },
    { label: 'Address', value: variables.ORG_ADDRESS },
    { label: 'Liaison', value: variables.CONTACT_NAME ? undefined : undefined },
    { label: 'Email', value: variables.ORG_EMAIL },
  ].filter((r) => r.value)

  const partnerRows = [
    { label: 'Name', value: variables.SPONSOR_NAME },
    { label: 'Org. No.', value: variables.SPONSOR_ORG_NUMBER },
    { label: 'Address', value: variables.SPONSOR_ADDRESS },
    { label: 'Liaison', value: variables.CONTACT_NAME },
    { label: 'Email', value: variables.CONTACT_EMAIL },
  ].filter((r) => r.value)

  return (
    <View style={styles.infoTable}>
      <View style={[styles.infoColumn, styles.infoColumnLeft]}>
        <Text style={styles.infoColumnHeader}>Organizer</Text>
        {orgRows.map((row, idx) => (
          <View key={`org-${idx}`} style={styles.infoRow}>
            <Text style={styles.infoLabel}>{row.label}</Text>
            <Text style={styles.infoValue}>{row.value}</Text>
          </View>
        ))}
      </View>
      <View style={styles.infoColumn}>
        <Text style={styles.infoColumnHeader}>Partner</Text>
        {partnerRows.map((row, idx) => (
          <View key={`partner-${idx}`} style={styles.infoRow}>
            <Text style={styles.infoLabel}>{row.label}</Text>
            <Text style={styles.infoValue}>{row.value}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

interface EventDetailsProps {
  variables: Record<string, string>
}

function EventDetails({ variables }: EventDetailsProps) {
  const rows = [
    { label: 'Event', value: variables.CONFERENCE_TITLE },
    {
      label: 'Date(s)',
      value: variables.CONFERENCE_DATES || variables.CONFERENCE_DATE,
    },
    {
      label: 'Venue',
      value: [
        variables.VENUE_NAME,
        variables.VENUE_ADDRESS,
        variables.CONFERENCE_CITY,
      ]
        .filter(Boolean)
        .join(', '),
    },
  ].filter((r) => r.value)

  return (
    <View style={styles.detailsSection}>
      <Text style={styles.detailsHeading}>Event Details</Text>
      {rows.map((row, idx) => (
        <View key={`event-${idx}`} style={styles.detailRow}>
          <Text style={styles.detailLabel}>{row.label}</Text>
          <Text style={styles.detailValue}>{row.value}</Text>
        </View>
      ))}
    </View>
  )
}

interface PackageDetailsProps {
  variables: Record<string, string>
}

function PackageDetails({ variables }: PackageDetailsProps) {
  const rows = [
    { label: 'Partnership Level', value: variables.TIER_NAME },
    { label: 'Total Fee', value: variables.CONTRACT_VALUE },
    { label: 'Add-ons', value: variables.ADDONS_LIST },
  ].filter((r) => r.value)

  if (rows.length === 0) return null

  return (
    <View style={styles.detailsSection}>
      <Text style={styles.detailsHeading}>Selected Sponsorship Package</Text>
      {rows.map((row, idx) => (
        <View key={`pkg-${idx}`} style={styles.detailRow}>
          <Text style={styles.detailLabel}>{row.label}</Text>
          <Text style={styles.detailValue}>{row.value}</Text>
        </View>
      ))}
    </View>
  )
}

interface ContractDocumentProps {
  template: ContractTemplate
  variables: Record<string, string>
}

function ContractDocument({ template, variables }: ContractDocumentProps) {
  const title = processTemplateVariables(template.title, variables)

  return (
    <Document
      title={title}
      author={template.headerText || 'Cloud Native Days Norway'}
    >
      {/* Page 1: Partner Agreement */}
      <Page size="A4" style={styles.page}>
        {template.headerText && (
          <Text style={styles.header}>
            {processTemplateVariables(template.headerText, variables)}
          </Text>
        )}

        <Text style={styles.title}>{title}</Text>

        <InfoTable variables={variables} />

        <EventDetails variables={variables} />

        <PackageDetails variables={variables} />

        {template.sections.map((section) => (
          <View key={section._key}>
            <Text style={styles.sectionHeading}>
              {processTemplateVariables(section.heading, variables)}
            </Text>
            {section.body &&
              renderPortableTextToElements(section.body, variables)}
          </View>
        ))}

        <View style={styles.signatureArea}>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLabel}>
              {variables.ORG_NAME || 'Organizer'}
            </Text>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Date / Signature</Text>
          </View>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLabel}>
              {variables.SPONSOR_NAME || 'Sponsor'}
            </Text>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Date / Signature</Text>
            {process.env.CONTRACT_SIGNING_PROVIDER !== 'self-hosted' && (
              <>
                <Text style={{ fontSize: 1, color: '#ffffff' }}>
                  {'{{Sig_es_:signer1:signature}}'}
                </Text>
                <Text style={{ fontSize: 1, color: '#ffffff' }}>
                  {'{{Dte_es_:signer1:date}}'}
                </Text>
              </>
            )}
          </View>
        </View>

        {template.footerText && (
          <Text style={styles.footer}>
            {processTemplateVariables(template.footerText, variables)}
          </Text>
        )}
      </Page>

      {/* Appendix 1: General Terms & Conditions */}
      {template.terms && template.terms.length > 0 && (
        <Page size="A4" style={styles.page}>
          {template.headerText && (
            <Text style={styles.header}>
              {processTemplateVariables(template.headerText, variables)}
            </Text>
          )}

          <Text style={styles.appendixTitle}>
            Appendix 1: General Terms &amp; Conditions
          </Text>

          {renderPortableTextToElements(template.terms, variables, {
            headingStyle: styles.termsHeading,
          })}

          {template.footerText && (
            <Text style={styles.footer}>
              {processTemplateVariables(template.footerText, variables)}
            </Text>
          )}
        </Page>
      )}
    </Document>
  )
}

export async function generateContractPdf(
  template: ContractTemplate,
  context: ContractVariableContext,
): Promise<Buffer> {
  const variables = buildContractVariables(context)
  const doc = <ContractDocument template={template} variables={variables} />
  const buffer = await renderToBuffer(doc)
  return Buffer.from(buffer)
}

export { ContractDocument }
