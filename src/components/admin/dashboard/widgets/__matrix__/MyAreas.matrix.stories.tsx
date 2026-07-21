import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { MyAreasWidget } from '../MyAreasWidget'
import {
  setMockActionFor,
  mockPending,
  mockFailure,
  mockResolved,
} from './mock-admin-actions'
import { conferenceInPhase, myAreasTwoTeams } from './fixtures'
import {
  WidgetFrame,
  MatrixGrid,
  matrixSizesFor,
  defaultSizeFor,
} from './WidgetFrame'

const TYPE = 'my-areas'

// Not phase-adaptive: only the useWidgetData states matter here. The
// presentational body already has its own stories (MyAreasView.stories.tsx);
// this file covers the widget THROUGH the action boundary + the size axis.
const twoTeams = conferenceInPhase('planning', 'my-areas/two-teams')
const noTeams = conferenceInPhase('planning', 'my-areas/no-teams')
const loading = conferenceInPhase('planning', 'my-areas/loading')
const failing = conferenceInPhase('planning', 'my-areas/error')

setMockActionFor(
  twoTeams._id,
  'fetchMyAreasData',
  mockResolved(myAreasTwoTeams),
)
setMockActionFor(noTeams._id, 'fetchMyAreasData', mockResolved({ areas: [] }))
setMockActionFor(loading._id, 'fetchMyAreasData', mockPending)
setMockActionFor(failing._id, 'fetchMyAreasData', mockFailure)

const meta = {
  title: 'Systems/Proposals/Admin/Dashboard/Matrix/MyAreas',
  tags: ['matrix'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'State x size matrix for MyAreasWidget (through the mocked action boundary) inside the real WidgetContainer geometry. The 3x2 two-team cell is the flagged known-risk cell — it is also the registry minimum AND default.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const AllSizesTwoTeams: Story = {
  render: () => (
    <MatrixGrid>
      {matrixSizesFor(TYPE).map((s) => (
        <WidgetFrame
          key={s.name}
          label={s.name}
          colSpan={s.colSpan}
          rowSpan={s.rowSpan}
        >
          <MyAreasWidget conference={twoTeams} />
        </WidgetFrame>
      ))}
    </MatrixGrid>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Every registry size with two teams and four metrics (one 99+ badge, long labels). The min/default 3x2 cell is the flagged known-risk cell.',
      },
    },
  },
}

export const AllStatesDefaultSize: Story = {
  render: () => {
    const size = defaultSizeFor(TYPE)
    return (
      <MatrixGrid>
        <WidgetFrame label="loading" {...size}>
          <MyAreasWidget conference={loading} />
        </WidgetFrame>
        <WidgetFrame label="error" {...size}>
          <MyAreasWidget conference={failing} />
        </WidgetFrame>
        <WidgetFrame label="no teams (inert empty)" {...size}>
          <MyAreasWidget conference={noTeams} />
        </WidgetFrame>
        <WidgetFrame label="two teams" {...size}>
          <MyAreasWidget conference={twoTeams} />
        </WidgetFrame>
        <WidgetFrame label="no conference" {...size}>
          <MyAreasWidget />
        </WidgetFrame>
      </MatrixGrid>
    )
  },
}

export const MobileAndEditChrome: Story = {
  render: () => {
    const size = defaultSizeFor(TYPE)
    return (
      <MatrixGrid>
        <WidgetFrame label="mobile two teams" mode="mobile">
          <MyAreasWidget conference={twoTeams} />
        </WidgetFrame>
        <WidgetFrame label="mobile no teams" mode="mobile">
          <MyAreasWidget conference={noTeams} />
        </WidgetFrame>
        <WidgetFrame label="edit chrome" {...size} editMode>
          <MyAreasWidget conference={twoTeams} />
        </WidgetFrame>
      </MatrixGrid>
    )
  },
}
