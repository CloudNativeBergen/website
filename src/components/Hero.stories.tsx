import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Hero } from './Hero'
import type { Conference } from '@/lib/conference/types'

const meta = {
  title: 'Components/Layout/Hero',
  component: Hero,
  decorators: [
    // The global preview decorator pads every story with `p-8`. On a full-bleed
    // hero that is not neutral chrome: at the 393px mobile capture it eats 16%
    // of the viewport, so the hero is measured and reviewed at a width no
    // visitor ever sees. Cancelling the inset makes the story — and every
    // `pnpm shoot` capture of it — map 1:1 to the real page.
    (Story) => (
      <div className="-m-8">
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Homepage hero with tagline, description, phase-dependent action buttons (capped at 3, tickets/program prioritized), optional venue line, vanity metrics, and mobile social links. The tickets button advertises the lowest active ticket price when available.',
      },
    },
  },
} satisfies Meta<typeof Hero>

export default meta
type Story = StoryObj<typeof meta>

const baseConference = {
  _id: 'conf-1',
  title: 'Cloud Native Days Norway 2026',
  organizer: 'Cloud Native Days Norway',
  tagline: 'The community conference for cloud native technologies',
  description:
    'Join hundreds of developers, platform engineers and cloud native enthusiasts for a full day of talks and workshops in Bergen.',
  city: 'Bergen',
  country: 'Norway',
  venueName: 'Grieghallen',
  venueAddress: 'Edvard Griegs plass 1, 5015 Bergen',
  startDate: '2099-09-15',
  endDate: '2099-09-15',
  cfpStartDate: '2020-01-01',
  cfpEndDate: '2020-06-01',
  cfpNotifyDate: '2020-07-01',
  cfpEmail: 'cfp@example.com',
  sponsorEmail: 'sponsors@example.com',
  programDate: '2099-07-15',
  contactEmail: 'info@example.com',
  registrationLink: 'https://tickets.example.com',
  registrationEnabled: true,
  domains: ['2026.cloudnativedays.no'],
  formats: [],
  topics: [],
  organizers: [],
  socialLinks: [],
  vanityMetrics: [
    { label: 'Attendees', value: '450+' },
    { label: 'Speakers', value: '40' },
    { label: 'Tracks', value: '4' },
  ],
} as unknown as Conference

export const RegistrationOpenWithPrice: Story = {
  args: {
    conference: baseConference,
    ticketsFromPrice: '3 490',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Registration open with pricing available from Checkin.no: the tickets button advertises the lowest price ("Get tickets — from 3 490 kr excl. VAT"). Venue line and vanity metrics visible. Resize to mobile to verify the long label wraps acceptably.',
      },
    },
  },
}

export const RegistrationOpenWithoutPrice: Story = {
  args: {
    conference: baseConference,
    ticketsFromPrice: null,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Pricing unavailable (Checkin.no down or unconfigured): the tickets button silently falls back to the plain "Tickets" label.',
      },
    },
  },
}

export const CfpOpen: Story = {
  args: {
    conference: {
      ...baseConference,
      cfpStartDate: '2020-01-01',
      cfpEndDate: '2099-06-01',
      registrationEnabled: false,
    } as unknown as Conference,
  },
  parameters: {
    docs: {
      description: {
        story: 'CFP open, registration not yet available.',
      },
    },
  },
}

export const ProgramPublished: Story = {
  args: {
    conference: {
      ...baseConference,
      programDate: '2020-07-15',
    } as unknown as Conference,
    ticketsFromPrice: '3 490',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Program published: vanity metrics remain visible (social proof stays up when purchase intent peaks) alongside program and ticket buttons.',
      },
    },
  },
}

export const MinimalConference: Story = {
  args: {
    conference: {
      ...baseConference,
      venueName: undefined,
      venueAddress: undefined,
      vanityMetrics: undefined,
      registrationEnabled: false,
    } as unknown as Conference,
  },
  parameters: {
    docs: {
      description: {
        story:
          'No venue, metrics, or registration configured: only the practical-info button renders and optional sections are omitted.',
      },
    },
  },
}

/* -------------------------------------------------------------------------- */
/* Variants                                                                    */
/*                                                                             */
/* One story per registered variant, on IDENTICAL data, so the three can be    */
/* compared side by side — this is the review surface for the variant work.    */
/* `classic` is the default and must look exactly like the stories above.      */
/* -------------------------------------------------------------------------- */

export const VariantClassic: Story = {
  name: 'Variant: Classic (default)',
  args: {
    conference: baseConference,
    ticketsFromPrice: '3 490',
    variant: 'classic',
  },
  parameters: {
    docs: {
      description: {
        story:
          'The default, and what every existing conference renders: patterned background wash, oversized display tagline, phase CTA row, venue line and the vanity-metric row. Stored compositions never persist this value — an absent variant resolves here.',
      },
    },
  },
}

export const VariantMinimal: Story = {
  name: 'Variant: Minimal',
  args: {
    conference: baseConference,
    ticketsFromPrice: '3 490',
    variant: 'minimal',
  },
  parameters: {
    docs: {
      description: {
        story:
          'The restrained, typographic hero: no background pattern, no venue line, no metric row, no social row. Dates and city are set as a mono letterspaced eyebrow, the headline sits in ink rather than oversized brand display type, and the whole column is flush left on a tight vertical rhythm. For conferences whose brand is understated — and for tenants who place Venue and Metrics as their own sections lower down.',
      },
    },
  },
}

export const VariantEmblem: Story = {
  name: 'Variant: Emblem',
  args: {
    conference: baseConference,
    ticketsFromPrice: '3 490',
    variant: 'emblem',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Leads with the conference mark. On mobile the mark comes first, centred in a brand-tinted halo, with name, headline and dates stacked beneath; from `lg` the composition splits — text left, mark large on the right. Without an uploaded logomark the mark is the generated initials monogram, painted from the tenant `--brand-*` properties. Metrics move below the composition as a ruled strip.',
      },
    },
  },
}

/**
 * A tenant with a real uploaded logomark — the case `emblem` is designed for.
 * The inline SVG is a stand-in for the tenant asset stored on the conference.
 */
const brandedConference = {
  ...baseConference,
  title: 'Fjord Systems Summit',
  tagline: 'Systems that hold at scale',
  logomarkBright: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="none" stroke="#0f766e" stroke-width="6"/><path d="M22 66 L42 34 L58 58 L70 42 L82 66" fill="none" stroke="#0f766e" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  logomarkDark: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="none" stroke="#5eead4" stroke-width="6"/><path d="M22 66 L42 34 L58 58 L70 42 L82 66" fill="none" stroke="#5eead4" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
} as unknown as Conference

export const VariantEmblemWithLogomark: Story = {
  name: 'Variant: Emblem (uploaded logomark)',
  args: {
    conference: brandedConference,
    ticketsFromPrice: '2 950',
    variant: 'emblem',
  },
  parameters: {
    docs: {
      description: {
        story:
          'The same variant for a tenant that HAS uploaded a logomark: the conference artwork replaces the generated monogram, with the light/dark pair swapping by colour scheme.',
      },
    },
  },
}

export const VariantMinimalWithAnnouncement: Story = {
  name: 'Variant: Minimal (announcement)',
  args: {
    conference: {
      ...baseConference,
      announcement: [
        {
          _type: 'block',
          _key: 'a1',
          style: 'normal',
          children: [
            {
              _type: 'span',
              _key: 's1',
              text: 'The venue has moved to Grieghallen — tickets already bought stay valid.',
            },
          ],
        },
      ],
    } as unknown as Conference,
    ticketsFromPrice: '3 490',
    variant: 'minimal',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Time-critical organizer announcements survive every variant, including the most restrained one: dropping them would let a layout choice hide "the venue has moved".',
      },
    },
  },
}
