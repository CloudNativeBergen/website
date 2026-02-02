export interface ColorDefinition {
  name: string
  value: string
  description: string
  usage: string
  tailwind: string
}

export interface TypographyDefinition {
  name: string
  className: string
  description: string
  tone: string
  usage: string
  example: string
}

export const colorPalette = {
  primary: [
    {
      name: 'Cloud Blue',
      value: '#1D4ED8',
      description:
        'Used in headlines and CTA buttons. Strong, tech-oriented, and accessible.',
      usage: 'Headlines, primary buttons, key navigation elements',
      tailwind: 'bg-brand-cloud-blue text-brand-cloud-blue',
    },
    {
      name: 'Aqua Gradient',
      value: 'linear-gradient(135deg, #3B82F6, #06B6D4)',
      description: 'For backgrounds, section dividers, or digital badges.',
      usage: 'Hero backgrounds, section dividers, badges',
      tailwind: 'bg-aqua-gradient',
    },
    {
      name: 'Brand Gradient',
      value: 'linear-gradient(135deg, #1D4ED8, #06B6D4)',
      description:
        'Enhanced brand gradient for premium sections and hero areas.',
      usage: 'Primary hero sections, premium features, branding headers',
      tailwind: 'bg-brand-gradient',
    },
    {
      name: 'Nordic Gradient',
      value: 'linear-gradient(135deg, #6366F1, #1D4ED8)',
      description: 'Accent gradient combining nordic purple with cloud blue.',
      usage: 'Secondary features, call-to-action sections, accent areas',
      tailwind: 'bg-nordic-gradient',
    },
  ] as ColorDefinition[],
  secondary: [
    {
      name: 'Sky Mist',
      value: '#E0F2FE',
      description:
        'A soft sky blue for background fills, cards, or hover states.',
      usage: 'Card backgrounds, hover states, subtle highlights',
      tailwind: 'bg-brand-sky-mist',
    },
    {
      name: 'Fresh Green',
      value: '#10B981',
      description:
        'Reflects the green in our logo. Good for highlights, tags, or eco-related themes.',
      usage: 'Success states, tags, eco themes, speaker badges',
      tailwind: 'bg-brand-fresh-green',
    },
    {
      name: 'Glacier White',
      value: '#F9FAFB',
      description:
        'A clean background neutral to keep the interface minimal and modern.',
      usage: 'Page backgrounds, card fills, clean sections',
      tailwind: 'bg-brand-glacier-white',
    },
  ] as ColorDefinition[],
  accent: [
    {
      name: 'Nordic Purple',
      value: '#6366F1',
      description:
        'Subtle contrast for agenda highlights, speaker names, or session tags.',
      usage: 'Agenda highlights, speaker emphasis, session categories',
      tailwind: 'bg-brand-nordic-purple',
    },
    {
      name: 'Sunbeam Yellow',
      value: '#FACC15',
      description:
        'For urgency, early-bird ticket alerts, and callouts without breaking cool-tone harmony.',
      usage: 'Alerts, early-bird notifications, important callouts',
      tailwind: 'bg-brand-sunbeam-yellow',
    },
  ] as ColorDefinition[],
  neutral: [
    {
      name: 'Slate Gray',
      value: '#334155',
      description: 'For body text, navigation, or footer elements.',
      usage: 'Body text, navigation, secondary information',
      tailwind: 'text-brand-slate-gray',
    },
    {
      name: 'Frosted Steel',
      value: '#CBD5E1',
      description: 'For dividers, secondary buttons, or muted labels.',
      usage: 'Dividers, muted text, secondary elements',
      tailwind: 'bg-brand-frosted-steel',
    },
  ] as ColorDefinition[],
} as const

export const typography = {
  primary: [
    {
      name: 'JetBrains Mono',
      className: 'font-jetbrains',
      description:
        'A monospaced font made for developers. Playful, readable, and distinctly "dev culture."',
      tone: 'Developer-native, playful, authentic',
      usage: 'Hero text, quotes, session titles, code examples',
      example: 'Cloud Native Days Norway',
    },
    {
      name: 'Space Grotesk',
      className: 'font-space-grotesk',
      description:
        'Clean, geometric sans-serif with a slightly quirky personality.',
      tone: 'Futuristic yet warm',
      usage: 'Section headings, speaker names, navigation',
      example: 'Kubernetes in Production',
    },
    {
      name: 'Bricolage Grotesque',
      className: 'font-bricolage',
      description:
        'Grotesque-style with some expressive, almost rebellious energy.',
      tone: 'Open-source spirit meets design edge',
      usage: 'Special announcements, call-to-action text',
      example: 'Submit Your Talk Now!',
    },
  ] as TypographyDefinition[],
  secondary: [
    {
      name: 'Inter',
      className: 'font-inter',
      description: 'Versatile, neutral sans-serif with high legibility.',
      tone: 'Functional, modern, minimal',
      usage: 'Body text, descriptions, form labels',
      example:
        'Join us for a day of learning about cloud native technologies, networking with industry experts, and discovering the latest trends in Kubernetes and containerization.',
    },
    {
      name: 'IBM Plex Sans',
      className: 'font-ibm-plex-sans',
      description: 'A great balance of precision and friendliness.',
      tone: 'Engineering-friendly with typographic richness',
      usage: 'Alternative body text, technical content',
      example:
        'Learn about microservices architecture, service mesh implementations, and cloud-native security best practices.',
    },
    {
      name: 'Atkinson Hyperlegible',
      className: 'font-atkinson',
      description:
        'Designed for readability, but with unique, humanistic forms.',
      tone: 'Thoughtful, community-driven, accessible',
      usage: 'Accessibility-focused content, important announcements',
      example:
        'We are committed to creating an inclusive and accessible conference experience for all attendees.',
    },
  ] as TypographyDefinition[],
} as const
