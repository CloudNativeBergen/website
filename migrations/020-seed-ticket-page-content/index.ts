import { at, defineMigration, set, setIfMissing } from 'sanity/migrate'

function generateKey(prefix: string, index: number): string {
  return `${prefix}${index.toString().padStart(2, '0')}`
}

const TICKET_CUSTOMIZATION = {
  hero_headline: 'Provision Your Seat for Production Grade',
  hero_subheadline:
    "Unifying Norway's cloud-native ecosystem. Join 500 engineers and architects in Bergen for two days of deep-dives, zero fluff, and high-bandwidth networking.",
  show_vanity_metrics: false,
  group_discount_info:
    'Looking for a more efficient way to provision seats for your team? Our Community Partner Package includes a baseline of attendee seats, and we offer exclusive discounted rates for additional nodes to all our sponsors.\n\nSponsoring is the most effective way to scale your team\u2019s presence while building technical credibility in the community. Reach out to contact@cloudnativedays.no to discuss partner-exclusive pricing and custom group invoicing.',
  cta_button_text: 'Register Now',
}

const TICKET_INCLUSIONS = [
  {
    _key: generateKey('inc', 1),
    title: 'Full access to all technical tracks and deep-dives',
    icon: 'PresentationChartBarIcon',
  },
  {
    _key: generateKey('inc', 2),
    title: 'Hands-on Workshop access (Full Stack tickets only)',
    icon: 'CommandLineIcon',
  },
  {
    _key: generateKey('inc', 3),
    title: 'Runtime Fuel: High-quality lunch, snacks, and barista-grade coffee',
    icon: 'BeakerIcon',
  },
  {
    _key: generateKey('inc', 4),
    title:
      'The Legendary Afterparty: High-availability networking with the community',
    icon: 'MusicalNoteIcon',
  },
  {
    _key: generateKey('inc', 5),
    title: 'Production-Grade Swag: Limited edition 2026 attendee kit',
    icon: 'GiftIcon',
  },
  {
    _key: generateKey('inc', 6),
    title: 'Post-event access to all session recordings and slide decks',
    icon: 'FilmIcon',
  },
]

const TICKET_FAQS = [
  {
    _key: generateKey('faq', 1),
    question: 'Can I upgrade my ticket?',
    answer:
      "Yes. If you've provisioned a Conference Only ticket and want to upgrade to Full Stack, contact us. We'll help you reconfigure your registration.",
  },
  {
    _key: generateKey('faq', 2),
    question: 'Do you support dietary configs?',
    answer:
      'Absolutely. We cater to all dietary requirements (Vegetarian, Vegan, Gluten-free, etc.). You can specify your "environment variables" during the checkout process.',
  },
  {
    _key: generateKey('faq', 3),
    question: 'Are tickets transferable?',
    answer:
      'Yes. You can re-assign your ticket to another colleague in your organization via the link in your confirmation email until Oct 1st.',
  },
  {
    _key: generateKey('faq', 4),
    question: 'Is there a Code of Conduct?',
    answer:
      'Yes. We run a "Safe Production" environment. All attendees must adhere to our CoC to ensure an inclusive and respectful experience for everyone.',
  },
]

export default defineMigration({
  title: 'Seed initial ticket page content for conferences',
  documentTypes: ['conference'],

  migrate: {
    document(doc) {
      const conference = doc as unknown as {
        _id: string
        title: string
        ticket_customization?: Record<string, unknown>
        ticket_inclusions?: unknown[]
        ticket_faqs?: unknown[]
      }

      const operations = []

      // Only seed if ticket_customization is not already set
      if (
        !conference.ticket_customization ||
        !conference.ticket_customization.hero_headline
      ) {
        console.log(
          `Seeding ticket_customization for conference: ${conference.title}`,
        )
        operations.push(
          at('ticket_customization', setIfMissing({})),
          at('ticket_customization', set(TICKET_CUSTOMIZATION)),
        )
      }

      // Only seed if ticket_inclusions is empty or not set
      if (
        !conference.ticket_inclusions ||
        conference.ticket_inclusions.length === 0
      ) {
        console.log(
          `Seeding ticket_inclusions for conference: ${conference.title}`,
        )
        operations.push(at('ticket_inclusions', set(TICKET_INCLUSIONS)))
      }

      // Only seed if ticket_faqs is empty or not set
      if (!conference.ticket_faqs || conference.ticket_faqs.length === 0) {
        console.log(`Seeding ticket_faqs for conference: ${conference.title}`)
        operations.push(at('ticket_faqs', set(TICKET_FAQS)))
      }

      return operations
    },
  },
})
