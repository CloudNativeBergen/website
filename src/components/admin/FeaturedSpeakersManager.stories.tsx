import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { FeaturedSpeakersManager } from './FeaturedSpeakersManager'
import { http, HttpResponse } from 'msw'

const mockFeaturedSpeakers = [
  {
    _id: 'speaker-1',
    name: 'Anna Hansen',
    title: 'Platform Engineer at TechCorp',
    image: null,
    talks: [{ title: 'Building Kubernetes Operators' }],
  },
  {
    _id: 'speaker-2',
    name: 'Erik Larsen',
    title: 'SRE Lead at CloudScale',
    image: null,
    talks: [{ title: 'Observability at Scale' }],
  },
]

const mockAvailableSpeakers = [
  {
    _id: 'speaker-3',
    name: 'Sofia Berg',
    title: 'DevOps Architect',
    image: null,
    proposals: [{ title: 'GitOps Best Practices' }],
  },
  {
    _id: 'speaker-4',
    name: 'Magnus Olsen',
    title: 'Cloud Native Engineer',
    image: null,
    proposals: [{ title: 'Service Mesh Deep Dive' }],
  },
]

const handlers = [
  http.get('/api/trpc/featured.featuredSpeakers', () => {
    return HttpResponse.json({
      result: { data: mockFeaturedSpeakers },
    })
  }),
  http.get('/api/trpc/speakers.search', () => {
    return HttpResponse.json({
      result: { data: mockAvailableSpeakers },
    })
  }),
  http.get('/api/trpc/featured.summary', () => {
    return HttpResponse.json({
      result: { data: { speakersCount: 2, talksCount: 2 } },
    })
  }),
  http.post('/api/trpc/featured.addSpeaker', () => {
    return HttpResponse.json({ result: { data: { success: true } } })
  }),
  http.post('/api/trpc/featured.removeSpeaker', () => {
    return HttpResponse.json({ result: { data: { success: true } } })
  }),
]

const meta: Meta<typeof FeaturedSpeakersManager> = {
  title: 'Systems/Speakers/Admin/FeaturedSpeakersManager',
  component: FeaturedSpeakersManager,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Admin component for managing featured speakers on the conference landing page. Allows searching for speakers with confirmed talks and adding them to the featured section.',
      },
    },
    msw: { handlers },
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl p-4">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof FeaturedSpeakersManager>

export const Default: Story = {
  args: {},
}

export const WithClassName: Story = {
  args: {
    className: 'border-2 border-blue-500',
  },
}

export const Empty: Story = {
  args: {},
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/featured.featuredSpeakers', () => {
          return HttpResponse.json({
            result: { data: [] },
          })
        }),
        http.get('/api/trpc/speakers.search', () => {
          return HttpResponse.json({
            result: { data: mockAvailableSpeakers },
          })
        }),
        http.post('/api/trpc/featured.addSpeaker', () => {
          return HttpResponse.json({ result: { data: { success: true } } })
        }),
      ],
    },
  },
}

export const ManyFeaturedSpeakers: Story = {
  args: {},
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/featured.featuredSpeakers', () => {
          return HttpResponse.json({
            result: {
              data: [
                ...mockFeaturedSpeakers,
                {
                  _id: 'speaker-5',
                  name: 'Ingrid Nilsen',
                  title: 'Security Engineer',
                  image: null,
                  talks: [{ title: 'Cloud Security Best Practices' }],
                },
                {
                  _id: 'speaker-6',
                  name: 'Lars Andersen',
                  title: 'Platform Lead',
                  image: null,
                  talks: [
                    { title: 'Building Internal Platforms' },
                    { title: 'Developer Experience Workshop' },
                  ],
                },
              ],
            },
          })
        }),
        http.get('/api/trpc/speakers.search', () => {
          return HttpResponse.json({
            result: { data: [] },
          })
        }),
        http.post('/api/trpc/featured.removeSpeaker', () => {
          return HttpResponse.json({ result: { data: { success: true } } })
        }),
      ],
    },
  },
}
