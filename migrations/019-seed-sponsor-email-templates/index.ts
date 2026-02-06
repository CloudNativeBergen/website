import { defineMigration, createIfNotExists } from 'sanity/migrate'

function textBlock(text: string, key: string): Record<string, unknown> {
  return {
    _type: 'block',
    _key: key,
    style: 'normal',
    markDefs: [],
    children: [
      {
        _type: 'span',
        _key: `${key}-span`,
        text,
        marks: [],
      },
    ],
  }
}

function listBlock(text: string, key: string): Record<string, unknown> {
  return {
    _type: 'block',
    _key: key,
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    markDefs: [],
    children: [
      {
        _type: 'span',
        _key: `${key}-span`,
        text,
        marks: [],
      },
    ],
  }
}

const TEMPLATES = [
  {
    _id: 'template-cold-outreach',
    _type: 'sponsorEmailTemplate' as const,
    title: 'Cold Outreach (English)',
    slug: { _type: 'slug', current: 'cold-outreach' },
    category: 'cold-outreach',
    subject: 'Partnership opportunity: {{{CONFERENCE_TITLE}}}',
    description:
      'First contact with a new potential sponsor (English language)',
    is_default: true,
    sort_order: 0,
    body: [
      textBlock('Hi {{{CONTACT_NAMES}}},', 'b1'),
      textBlock(
        'My name is {{{SENDER_NAME}}} from {{{ORG_NAME}}}. We are organizing {{{CONFERENCE_TITLE}}}, a practitioner-focused cloud native conference in {{{CONFERENCE_CITY}}} on {{{CONFERENCE_DATE}}}.',
        'b2',
      ),
      textBlock(
        'We are targeting 500 attendees, with 80% in Senior, Lead, or Architect roles. Our philosophy is simple: No booths, just credibility. We integrate your brand into the fabric of the event rather than using a traditional expo hall.',
        'b3',
      ),
      textBlock(
        'Our core offering is the Community Partner Package, and we also have exclusive add-ons (CRDs) such as Speakers Dinner, Barista Bar, and Track Sponsorship.',
        'b4',
      ),
      textBlock(
        'Full details are in the Sponsor Deck ({{{PROSPECTUS_URL}}}) and on the Sponsor Site ({{{SPONSOR_PAGE_URL}}}).',
        'b5',
      ),
      textBlock(
        'Do you have 15 minutes next week for a quick call to see if this fits your {{{CONFERENCE_YEAR}}} roadmap?',
        'b6',
      ),
      textBlock('Cheers,', 'b7'),
      textBlock('{{{SENDER_NAME}}}', 'b8'),
    ],
  },
  {
    _id: 'template-returning-sponsor',
    _type: 'sponsorEmailTemplate' as const,
    title: 'Returning Sponsor (English)',
    slug: { _type: 'slug', current: 'returning-sponsor' },
    category: 'returning-sponsor',
    subject: 'Welcome back: {{{CONFERENCE_TITLE}}}',
    description: 'Re-engage sponsors from previous editions (English language)',
    is_default: true,
    sort_order: 0,
    body: [
      textBlock('Hi {{{CONTACT_NAMES}}},', 'b1'),
      textBlock(
        "Thanks again for {{{SPONSOR_NAME}}}'s support of the Norwegian cloud native community over the years!",
        'b2',
      ),
      textBlock(
        'For {{{CONFERENCE_YEAR}}}, we have unified our roots to launch {{{CONFERENCE_TITLE}}}\u2014a single national conference in {{{CONFERENCE_CITY}}}. We are targeting 500 attendees, focusing on a practitioner-heavy audience where 80% occupy Senior, Lead, or Architect roles.',
        'b3',
      ),
      textBlock(
        'Our philosophy remains the same: No booths, just credibility. We integrate your brand into the fabric of the event instead of using a traditional expo hall.',
        'b4',
      ),
      textBlock(
        'Our core offering is the Community Partner Package. We also have exclusive add-ons (CRDs) available, including Speakers Dinner, Barista Bar, and Track Sponsorship.',
        'b5',
      ),
      textBlock(
        'Full details are in the Sponsor Deck ({{{PROSPECTUS_URL}}}) and on the Sponsor Site ({{{SPONSOR_PAGE_URL}}}).',
        'b6',
      ),
      textBlock(
        'Do you have 15 minutes next week for a quick call to see if this fits your {{{CONFERENCE_YEAR}}} roadmap?',
        'b7',
      ),
      textBlock('Cheers,', 'b8'),
      textBlock('{{{SENDER_NAME}}}', 'b9'),
    ],
  },
  {
    _id: 'template-international-sponsor',
    _type: 'sponsorEmailTemplate' as const,
    title: 'International Sponsor (English)',
    slug: { _type: 'slug', current: 'international-sponsor' },
    category: 'international',
    subject: 'Reach the Nordic cloud native community: {{{CONFERENCE_TITLE}}}',
    description: 'Outreach to international companies not based in Norway',
    is_default: true,
    sort_order: 0,
    body: [
      textBlock('Hi {{{CONTACT_NAMES}}},', 'b1'),
      textBlock(
        "Thanks again for {{{SPONSOR_NAME}}}'s support of the Norwegian cloud native community over the years!",
        'b2',
      ),
      textBlock(
        'For {{{CONFERENCE_YEAR}}}, we have unified our roots to launch {{{CONFERENCE_TITLE}}}\u2014a single national conference in {{{CONFERENCE_CITY}}}. We are targeting 500 attendees, focusing on a practitioner-heavy audience where 80% occupy Senior, Lead, or Architect roles.',
        'b3',
      ),
      textBlock(
        'Our philosophy remains the same: No booths, just credibility. We integrate your brand into the fabric of the event instead of using a traditional expo hall.',
        'b4',
      ),
      textBlock(
        'Our core offering is the Community Partner Package. We also have exclusive add-ons (CRDs) available, including:',
        'b5',
      ),
      listBlock(
        'Speakers Dinner: Exclusive access to international experts and CNCF Ambassadors.',
        'l1',
      ),
      listBlock(
        'Barista Bar: High-visibility branding at the event\u0027s most popular social hub.',
        'l2',
      ),
      listBlock(
        'Track Sponsorship: Direct visibility and \u201Croot access\u201D to a specific stage.',
        'l3',
      ),
      textBlock(
        'Full details are in the Sponsor Deck ({{{PROSPECTUS_URL}}}) and on the Sponsor Site ({{{SPONSOR_PAGE_URL}}}).',
        'b6',
      ),
      textBlock(
        'Do you have 15 minutes next week for a quick call to see if this fits your {{{CONFERENCE_YEAR}}} roadmap?',
        'b7',
      ),
      textBlock('Cheers,', 'b8'),
      textBlock('{{{SENDER_NAME}}}', 'b9'),
    ],
  },
  {
    _id: 'template-national-sponsor-no',
    _type: 'sponsorEmailTemplate' as const,
    title: 'Nasjonal sponsor (norsk)',
    slug: { _type: 'slug', current: 'national-sponsor-no' },
    category: 'returning-sponsor',
    subject: 'Sponsormuligheter: {{{CONFERENCE_TITLE}}}',
    description: 'Henvendelse til store nasjonale sponsorer (norsk spr\u00E5k)',
    is_default: false,
    sort_order: 10,
    body: [
      textBlock('Hei {{{CONTACT_NAMES}}},', 'b1'),
      textBlock(
        'Takk for at dere har sendt s\u00E5 mange engasjerte ansatte p\u00E5 tidligere konferanser. Det har v\u00E6rt utrolig kult \u00E5 se {{{SPONSOR_NAME}}} s\u00E5 sterkt representert.',
        'b2',
      ),
      textBlock(
        'I {{{CONFERENCE_YEAR}}} forener vi kreftene fra \u00F8st og vest til \u00E9n felles nasjonal konferanse: {{{CONFERENCE_TITLE}}}. Konferansen holdes i {{{CONFERENCE_CITY}}} {{{CONFERENCE_DATE}}}. Vi sikter mot 500 deltakere, hvorav 80% er i Senior-, Lead- eller arkitektroller.',
        'b3',
      ),
      textBlock(
        'Filosofien v\u00E5r er fortsatt \u201Cno booths, just credibility\u201D. Vi integrerer merkevaren deres direkte i det tekniske milj\u00F8et i stedet for en tradisjonell messehall. For {{{SPONSOR_NAME}}} er disse Sponsor Addons mest aktuelle i \u00E5r:',
        'b4',
      ),
      listBlock(
        'Track Sponsorship: F\u00E5 \u201Croot access\u201D som vert for en av de faglige scenene v\u00E5re.',
        'l1',
      ),
      listBlock(
        'Afterparty: Bli med p\u00E5 \u00E5 rigge konferansens sosiale h\u00F8ydepunkt.',
        'l2',
      ),
      listBlock(
        'Barista Bar: Sponsing av profesjonell kaffe \u2013 konferansens mest popul\u00E6re samlingspunkt.',
        'l3',
      ),
      textBlock(
        'Full oversikt finnes i Sponsor-decket ({{{PROSPECTUS_URL}}}) og p\u00E5 Sponsor-siden ({{{SPONSOR_PAGE_URL}}}).',
        'b5',
      ),
      textBlock(
        'Har dere 15 minutter i l\u00F8pet av neste uke til en kjapp prat for \u00E5 se p\u00E5 mulighetene?',
        'b6',
      ),
      textBlock('{{{SENDER_NAME}}}', 'b7'),
    ],
  },
  {
    _id: 'template-local-community',
    _type: 'sponsorEmailTemplate' as const,
    title: 'Lokal sponsor (norsk)',
    slug: { _type: 'slug', current: 'local-community' },
    category: 'local-community',
    subject:
      'St\u00F8tt det lokale cloud native-milj\u00F8et: {{{CONFERENCE_TITLE}}}',
    description: 'Henvendelse til lokale/sm\u00E5 sponsorer (norsk spr\u00E5k)',
    is_default: true,
    sort_order: 0,
    body: [
      textBlock('Hei {{{CONTACT_NAMES}}}!', 'b1'),
      textBlock(
        'Takk for at {{{SPONSOR_NAME}}} har v\u00E6rt med oss som sponsor tidligere! Som dere vet, handler Cloud Native Days om ekte teknisk n\u00F8rding og milj\u00F8bygging framfor tradisjonell markedsf\u00F8ring.',
        'b2',
      ),
      textBlock(
        'I {{{CONFERENCE_YEAR}}} tar vi steget fullt ut og forener kreftene fra \u00F8st og vest til \u00E9n felles nasjonal arena: {{{CONFERENCE_TITLE}}}. Konferansen arrangeres i {{{CONFERENCE_CITY}}} {{{CONFERENCE_DATE}}}.',
        'b3',
      ),
      textBlock(
        'Vi rigger oss for 500 deltakere, og som vanlig er 80% av deltakerne i Senior-, Lead- eller arkitektroller. Filosofien er den samme som f\u00F8r: No booths, just credibility. Vi fokuserer p\u00E5 at dere f\u00E5r vist fram teknisk kompetanse og bygget branding i et milj\u00F8 som vanligvis skyr tradisjonelle salgspitsjer.',
        'b4',
      ),
      textBlock(
        'Kjernepakken v\u00E5r er Community Partner Package, men vi har ogs\u00E5 noen fete Sponsor Addons (som Afterparty, Track Sponsorship og Barista Bar) hvis dere vil skille dere ekstra ut.',
        'b5',
      ),
      textBlock('Ta en kikk p\u00E5 detaljene her:', 'b6'),
      listBlock('Sponsor-side: {{{SPONSOR_PAGE_URL}}}', 'l1'),
      listBlock('Sponsor-deck: {{{PROSPECTUS_URL}}}', 'l2'),
      textBlock(
        'Har du 15 minutter til en kjapp prat i l\u00F8pet av neste uke for \u00E5 se om dette passer inn i planene deres for {{{CONFERENCE_YEAR}}}?',
        'b7',
      ),
      textBlock('{{{SENDER_NAME}}}', 'b8'),
    ],
  },
]

export default defineMigration({
  title: 'Seed sponsor email templates',
  documentTypes: ['sponsorEmailTemplate'],

  async *migrate() {
    for (const template of TEMPLATES) {
      yield createIfNotExists(template)
    }
  },
})
