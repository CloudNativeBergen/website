import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { FeaturedTalksManager } from './FeaturedTalksManager'
import { http, HttpResponse } from 'msw'

const mockFeaturedTalks = [
  {
    _id: 'talk-1',
    title: 'Building Production-Ready Kubernetes Operators',
    description:
      'Learn how to build robust Kubernetes operators using the Operator SDK.',
    format: 'presentation_45',
    status: 'confirmed',
    speakers: [{ name: 'Anna Hansen' }],
    topics: [
      { _id: 'topic-1', title: 'Kubernetes', color: '#326CE5' },
      { _id: 'topic-2', title: 'Operators', color: '#10B981' },
    ],
  },
  {
    _id: 'talk-2',
    title: 'Observability at Scale with OpenTelemetry',
    description:
      'A deep dive into implementing distributed tracing across microservices.',
    format: 'presentation_25',
    status: 'confirmed',
    speakers: [{ name: 'Erik Larsen' }],
    topics: [{ _id: 'topic-3', title: 'Observability', color: '#FFE66D' }],
  },
]

const mockAvailableTalks = [
  {
    _id: 'talk-3',
    title: 'GitOps: The Path to Continuous Deployment',
    description:
      'Implementing GitOps patterns with Flux and ArgoCD for reliable deployments.',
    format: 'presentation_45',
    status: 'confirmed',
    speakers: [{ name: 'Sofia Berg' }],
    topics: [
      { _id: 'topic-4', title: 'GitOps', color: '#FC5185' },
      { _id: 'topic-5', title: 'DevOps', color: '#FF6B6B' },
    ],
  },
  {
    _id: 'talk-4',
    title: 'Service Mesh Security Deep Dive',
    description: 'Understanding mTLS, authorization policies, and more.',
    format: 'presentation_25',
    status: 'accepted',
    speakers: [{ name: 'Magnus Olsen' }],
    topics: [
      { _id: 'topic-6', title: 'Security', color: '#4ECDC4' },
      { _id: 'topic-7', title: 'Service Mesh', color: '#3FC1C9' },
    ],
  },
]

const handlers = [
  http.get('/api/trpc/featured.featuredTalks', () => {
    return HttpResponse.json({
      result: { data: mockFeaturedTalks },
    })
  }),
  http.get('/api/trpc/proposals.searchTalks', () => {
    return HttpResponse.json({
      result: { data: mockAvailableTalks },
    })
  }),
  http.get('/api/trpc/featured.summary', () => {
    return HttpResponse.json({
      result: { data: { speakersCount: 2, talksCount: 2 } },
    })
  }),
  http.post('/api/trpc/featured.addTalk', () => {
    return HttpResponse.json({ result: { data: { success: true } } })
  }),
  http.post('/api/trpc/featured.removeTalk', () => {
    return HttpResponse.json({ result: { data: { success: true } } })
  }),
]

const meta: Meta<typeof FeaturedTalksManager> = {
  title: 'Systems/Proposals/Admin/FeaturedTalksManager',
  component: FeaturedTalksManager,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Admin component for managing featured talks on the conference landing page. Allows searching for confirmed/accepted talks and adding them to the featured section. Shows talk details including speakers, topics, and format.',
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
type Story = StoryObj<typeof FeaturedTalksManager>

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
        http.get('/api/trpc/featured.featuredTalks', () => {
          return HttpResponse.json({
            result: { data: [] },
          })
        }),
        http.get('/api/trpc/proposals.searchTalks', () => {
          return HttpResponse.json({
            result: { data: mockAvailableTalks },
          })
        }),
        http.post('/api/trpc/featured.addTalk', () => {
          return HttpResponse.json({ result: { data: { success: true } } })
        }),
      ],
    },
  },
}

export const ManyFeaturedTalks: Story = {
  args: {},
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/featured.featuredTalks', () => {
          return HttpResponse.json({
            result: {
              data: [
                ...mockFeaturedTalks,
                {
                  _id: 'talk-5',
                  title: 'Cloud Security Best Practices',
                  description:
                    'Essential security patterns for cloud native applications.',
                  format: 'presentation_45',
                  status: 'confirmed',
                  speakers: [{ name: 'Ingrid Nilsen' }],
                  topics: [
                    { _id: 'topic-8', title: 'Security', color: '#4ECDC4' },
                  ],
                },
                {
                  _id: 'talk-6',
                  title: 'Platform Engineering Workshop',
                  description: 'Hands-on workshop building internal platforms.',
                  format: 'workshop_180',
                  status: 'confirmed',
                  speakers: [{ name: 'Lars Andersen' }],
                  topics: [
                    {
                      _id: 'topic-9',
                      title: 'Platform Engineering',
                      color: '#95D5B2',
                    },
                  ],
                },
              ],
            },
          })
        }),
        http.get('/api/trpc/proposals.searchTalks', () => {
          return HttpResponse.json({
            result: { data: [] },
          })
        }),
        http.post('/api/trpc/featured.removeTalk', () => {
          return HttpResponse.json({ result: { data: { success: true } } })
        }),
      ],
    },
  },
}
