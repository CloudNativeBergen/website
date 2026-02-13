import { at, defineMigration, set, unset } from 'sanity/migrate'

// Maps old snake_case field names to new camelCase names per document type.
// Only top-level fields are renamed in the migration — nested object fields
// use a separate path-based approach.

const CONFERENCE_RENAMES: Record<string, string> = {
  venue_name: 'venueName',
  venue_address: 'venueAddress',
  logo_bright: 'logoBright',
  logo_dark: 'logoDark',
  logomark_bright: 'logomarkBright',
  logomark_dark: 'logomarkDark',
  start_date: 'startDate',
  end_date: 'endDate',
  cfp_start_date: 'cfpStartDate',
  cfp_end_date: 'cfpEndDate',
  cfp_notify_date: 'cfpNotifyDate',
  program_date: 'programDate',
  travel_support_payment_date: 'travelSupportPaymentDate',
  travel_support_budget: 'travelSupportBudget',
  registration_link: 'registrationLink',
  registration_enabled: 'registrationEnabled',
  workshop_registration_start: 'workshopRegistrationStart',
  workshop_registration_end: 'workshopRegistrationEnd',
  checkin_customer_id: 'checkinCustomerId',
  checkin_event_id: 'checkinEventId',
  ticket_capacity: 'ticketCapacity',
  ticket_targets: 'ticketTargets',
  ticket_customization: 'ticketCustomization',
  ticket_inclusions: 'ticketInclusions',
  ticket_faqs: 'ticketFaqs',
  contact_email: 'contactEmail',
  cfp_email: 'cfpEmail',
  sponsor_email: 'sponsorEmail',
  sales_notification_channel: 'salesNotificationChannel',
  cfp_notification_channel: 'cfpNotificationChannel',
  social_links: 'socialLinks',
  vanity_metrics: 'vanityMetrics',
  cfp_submission_goal: 'cfpSubmissionGoal',
  cfp_lightning_goal: 'cfpLightningGoal',
  cfp_presentation_goal: 'cfpPresentationGoal',
  cfp_workshop_goal: 'cfpWorkshopGoal',
  sponsor_revenue_goal: 'sponsorRevenueGoal',
  sponsor_benefits: 'sponsorBenefits',
  sponsorship_customization: 'sponsorshipCustomization',
  featured_speakers: 'featuredSpeakers',
  featured_talks: 'featuredTalks',
}

// Nested fields inside conference.ticket_targets (→ ticketTargets)
const TICKET_TARGETS_RENAMES: Record<string, string> = {
  sales_start_date: 'salesStartDate',
  target_curve: 'targetCurve',
}

// Nested field inside conference.ticket_targets.milestones[]
const MILESTONE_RENAMES: Record<string, string> = {
  target_percentage: 'targetPercentage',
}

// Nested fields inside conference.ticket_customization (→ ticketCustomization)
const TICKET_CUSTOMIZATION_RENAMES: Record<string, string> = {
  hero_headline: 'heroHeadline',
  hero_subheadline: 'heroSubheadline',
  show_vanity_metrics: 'showVanityMetrics',
  group_discount_info: 'groupDiscountInfo',
  cta_button_text: 'ctaButtonText',
}

// Nested fields inside conference.sponsorship_customization (→ sponsorshipCustomization)
const SPONSORSHIP_CUSTOMIZATION_RENAMES: Record<string, string> = {
  hero_headline: 'heroHeadline',
  hero_subheadline: 'heroSubheadline',
  package_section_title: 'packageSectionTitle',
  addon_section_title: 'addonSectionTitle',
  philosophy_title: 'philosophyTitle',
  philosophy_description: 'philosophyDescription',
  closing_quote: 'closingQuote',
  closing_cta_text: 'closingCtaText',
  prospectus_url: 'prospectusUrl',
}

const SPEAKER_RENAMES: Record<string, string> = {
  is_organizer: 'isOrganizer',
  is_featured: 'isFeatured',
}

const SPEAKER_BADGE_RENAMES: Record<string, string> = {
  badge_id: 'badgeId',
  badge_type: 'badgeType',
  issued_at: 'issuedAt',
  badge_json: 'badgeJson',
  baked_svg: 'bakedSvg',
  verification_url: 'verificationUrl',
  email_sent: 'emailSent',
  email_sent_at: 'emailSentAt',
  email_id: 'emailId',
  email_error: 'emailError',
}

const SPONSOR_RENAMES: Record<string, string> = {
  logo_bright: 'logoBright',
  org_number: 'orgNumber',
}

const SPONSOR_FOR_CONFERENCE_RENAMES: Record<string, string> = {
  contract_status: 'contractStatus',
  assigned_to: 'assignedTo',
  contact_initiated_at: 'contactInitiatedAt',
  contract_signed_at: 'contractSignedAt',
  contract_value: 'contractValue',
  contract_currency: 'contractCurrency',
  invoice_status: 'invoiceStatus',
  invoice_sent_at: 'invoiceSentAt',
  invoice_paid_at: 'invoicePaidAt',
  contact_persons: 'contactPersons',
}

// Nested field inside sponsorForConference.contact_persons[]
const CONTACT_PERSON_RENAMES: Record<string, string> = {
  is_primary: 'isPrimary',
}

const SPONSOR_TIER_RENAMES: Record<string, string> = {
  tier_type: 'tierType',
  max_quantity: 'maxQuantity',
  sold_out: 'soldOut',
  most_popular: 'mostPopular',
}

const SPONSOR_ACTIVITY_RENAMES: Record<string, string> = {
  sponsor_for_conference: 'sponsorForConference',
  activity_type: 'activityType',
  created_by: 'createdBy',
  created_at: 'createdAt',
}

// Nested fields inside sponsorActivity.metadata
const ACTIVITY_METADATA_RENAMES: Record<string, string> = {
  old_value: 'oldValue',
  new_value: 'newValue',
  additional_data: 'additionalData',
}

const SPONSOR_EMAIL_TEMPLATE_RENAMES: Record<string, string> = {
  is_default: 'isDefault',
  sort_order: 'sortOrder',
}

const DASHBOARD_CONFIG_WIDGET_RENAMES: Record<string, string> = {
  widget_id: 'widgetId',
  widget_type: 'widgetType',
  row_span: 'rowSpan',
  col_span: 'colSpan',
}

function renameFields(
  doc: Record<string, unknown>,
  renames: Record<string, string>,
) {
  const ops = []
  for (const [oldName, newName] of Object.entries(renames)) {
    if (oldName in doc && doc[oldName] !== undefined) {
      ops.push(at(newName, set(doc[oldName])))
      ops.push(at(oldName, unset()))
    }
  }
  return ops
}

function renameNestedFields(
  obj: Record<string, unknown>,
  basePath: string,
  renames: Record<string, string>,
) {
  const ops = []
  for (const [oldName, newName] of Object.entries(renames)) {
    if (oldName in obj && obj[oldName] !== undefined) {
      ops.push(at(`${basePath}.${newName}`, set(obj[oldName])))
      ops.push(at(`${basePath}.${oldName}`, unset()))
    }
  }
  return ops
}

export default defineMigration({
  title: 'Rename snake_case fields to camelCase',
  description:
    'Standardizes all field names to camelCase across conference, speaker, ' +
    'speakerBadge, sponsor, sponsorForConference, sponsorTier, sponsorActivity, ' +
    'sponsorEmailTemplate, and dashboardConfig document types.',
  documentTypes: [
    'conference',
    'speaker',
    'speakerBadge',
    'sponsor',
    'sponsorForConference',
    'sponsorTier',
    'sponsorActivity',
    'sponsorEmailTemplate',
    'dashboardConfig',
  ],

  migrate: {
    document(doc) {
      const ops: ReturnType<typeof at>[] = []

      switch (doc._type) {
        case 'conference': {
          ops.push(...renameFields(doc, CONFERENCE_RENAMES))

          // Handle nested ticket_targets fields
          const ticketTargets = (doc.ticket_targets ?? doc.ticketTargets) as
            | Record<string, unknown>
            | undefined
          if (ticketTargets && typeof ticketTargets === 'object') {
            ops.push(
              ...renameNestedFields(
                ticketTargets,
                'ticketTargets',
                TICKET_TARGETS_RENAMES,
              ),
            )

            // Handle milestones array nested target_percentage
            const milestones = ticketTargets.milestones as
              | Array<Record<string, unknown>>
              | undefined
            if (Array.isArray(milestones)) {
              milestones.forEach((milestone, i) => {
                ops.push(
                  ...renameNestedFields(
                    milestone,
                    `ticketTargets.milestones[${i}]`,
                    MILESTONE_RENAMES,
                  ),
                )
              })
            }
          }

          // Handle nested ticket_customization fields
          const ticketCustomization = (doc.ticket_customization ??
            doc.ticketCustomization) as Record<string, unknown> | undefined
          if (ticketCustomization && typeof ticketCustomization === 'object') {
            ops.push(
              ...renameNestedFields(
                ticketCustomization,
                'ticketCustomization',
                TICKET_CUSTOMIZATION_RENAMES,
              ),
            )
          }

          // Handle nested sponsorship_customization fields
          const sponsorshipCustomization = (doc.sponsorship_customization ??
            doc.sponsorshipCustomization) as Record<string, unknown> | undefined
          if (
            sponsorshipCustomization &&
            typeof sponsorshipCustomization === 'object'
          ) {
            ops.push(
              ...renameNestedFields(
                sponsorshipCustomization,
                'sponsorshipCustomization',
                SPONSORSHIP_CUSTOMIZATION_RENAMES,
              ),
            )
          }
          break
        }

        case 'speaker':
          ops.push(...renameFields(doc, SPEAKER_RENAMES))
          break

        case 'speakerBadge':
          ops.push(...renameFields(doc, SPEAKER_BADGE_RENAMES))
          break

        case 'sponsor':
          ops.push(...renameFields(doc, SPONSOR_RENAMES))
          break

        case 'sponsorForConference': {
          ops.push(...renameFields(doc, SPONSOR_FOR_CONFERENCE_RENAMES))

          // Handle nested contact_persons[].is_primary
          const contactPersons = (doc.contact_persons ?? doc.contactPersons) as
            | Array<Record<string, unknown>>
            | undefined
          if (Array.isArray(contactPersons)) {
            contactPersons.forEach((person, i) => {
              ops.push(
                ...renameNestedFields(
                  person,
                  `contactPersons[${i}]`,
                  CONTACT_PERSON_RENAMES,
                ),
              )
            })
          }
          break
        }

        case 'sponsorTier':
          ops.push(...renameFields(doc, SPONSOR_TIER_RENAMES))
          break

        case 'sponsorActivity': {
          ops.push(...renameFields(doc, SPONSOR_ACTIVITY_RENAMES))

          // Handle nested metadata fields
          const metadata = doc.metadata as Record<string, unknown> | undefined
          if (metadata && typeof metadata === 'object') {
            ops.push(
              ...renameNestedFields(
                metadata,
                'metadata',
                ACTIVITY_METADATA_RENAMES,
              ),
            )
          }
          break
        }

        case 'sponsorEmailTemplate':
          ops.push(...renameFields(doc, SPONSOR_EMAIL_TEMPLATE_RENAMES))
          break

        case 'dashboardConfig': {
          // Handle widget array nested fields
          const widgets = doc.widgets as
            | Array<Record<string, unknown>>
            | undefined
          if (Array.isArray(widgets)) {
            widgets.forEach((widget, i) => {
              ops.push(
                ...renameNestedFields(
                  widget,
                  `widgets[${i}]`,
                  DASHBOARD_CONFIG_WIDGET_RENAMES,
                ),
              )
            })
          }
          break
        }
      }

      return ops
    },
  },
})
