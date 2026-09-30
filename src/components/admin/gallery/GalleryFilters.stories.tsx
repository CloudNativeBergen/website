import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useCallback, useState } from 'react'
import { fn, expect, userEvent, within } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { GalleryFilters, type GalleryFilterValues } from './GalleryFilters'
import type { GalleryEditions } from '@/lib/gallery/editions'

/**
 * The admin gallery's filter bar with the EDITION filter (#1191): the current
 * conference by default, or one of the organization's previous editions as
 * the server lists them. Single-edition organizations never see the control.
 */

const EDITIONS: GalleryEditions = {
  current: { _id: 'conf-2026', title: 'Cloud Native Days Bergen 2026' },
  previous: [
    {
      _id: 'conf-2025',
      title: 'Cloud Native Days Bergen 2025',
      startDate: '2025-10-28',
      endDate: '2025-10-29',
    },
    {
      _id: 'conf-2024',
      title: 'Cloud Native Day Bergen 2024',
      startDate: '2024-10-30',
      endDate: '2024-10-30',
    },
  ],
}

function Harness({
  initial,
  editions,
  onChange,
}: {
  initial: GalleryFilterValues
  editions?: GalleryEditions
  /** Spy on every filter change the component emits. */
  onChange?: (filters: GalleryFilterValues) => void
}) {
  const [filters, setFilters] = useState<GalleryFilterValues>(initial)
  // STABLE, as the page's handler is: the URL-sync effect depends on it, and
  // an inline arrow would re-run that effect on every render.
  const handleChange = useCallback(
    (next: GalleryFilterValues) => {
      onChange?.(next)
      setFilters(next)
    },
    [onChange],
  )
  return (
    <GalleryFilters
      filters={filters}
      editions={editions}
      onFiltersChange={handleChange}
    />
  )
}

const meta = {
  title: 'Systems/Proposals/Admin/Gallery/GalleryFilters',
  component: Harness,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { push: fn() } },
    msw: {
      handlers: [
        http.get('/api/trpc/speaker.admin.search', () =>
          HttpResponse.json({ result: { data: [] } }),
        ),
      ],
    },
    docs: {
      description: {
        component:
          'Gallery filter bar. The edition select (#1191) appears only when the organization has previous editions; selecting one puts the page in read-only browsing. Resolves dark mode from `parameters.theme` via the local decorator.',
      },
    },
  },
  decorators: [
    (Story, ctx) => {
      const dark = ctx.parameters.theme === 'dark'
      return (
        <div className={dark ? 'dark' : ''}>
          <div className="min-h-screen bg-gray-50 p-4 dark:bg-gray-950">
            <Story />
          </div>
        </div>
      )
    },
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof Harness>

export default meta
type Story = StoryObj<typeof meta>

/** Default: the current edition, no filter active. */
export const CurrentEdition: Story = {
  args: { initial: {}, editions: EDITIONS },
  play: async ({ canvasElement }) => {
    const select = within(canvasElement).getAllByRole('combobox', {
      name: 'Edition',
    })[0] as HTMLSelectElement
    await expect(select.selectedOptions[0]).toHaveTextContent(
      'Cloud Native Days Bergen 2026 (current)',
    )
  },
}

/**
 * A previous edition selected — via the URL, which is the source of truth
 * (an empty URL means "no filters"): the filter counts as active (Clear appears).
 */
export const PreviousEditionSelected: Story = {
  args: { initial: {}, editions: EDITIONS },
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { push: fn(), query: { edition: 'conf-2025' } },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const select = canvas.getAllByRole('combobox', {
      name: 'Edition',
    })[0] as HTMLSelectElement
    await expect(select.value).toBe('conf-2025')
    await expect(select.selectedOptions[0]).toHaveTextContent(
      'Cloud Native Days Bergen 2025',
    )
    await expect(
      canvas.getAllByRole('button', { name: 'Clear all filters' })[0],
    ).toBeVisible()
  },
}

export const PreviousEditionSelectedDark: Story = {
  args: PreviousEditionSelected.args,
  play: PreviousEditionSelected.play,
  parameters: { ...PreviousEditionSelected.parameters, theme: 'dark' },
}

/**
 * Switching editions: a previous edition is emitted by id, and choosing the
 * current option again emits `undefined` — the server default — not its id.
 */
export const SwitchingEditions: Story = {
  args: { initial: {}, editions: EDITIONS, onChange: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const select = canvas.getAllByRole('combobox', { name: 'Edition' })[0]
    await userEvent.selectOptions(select, 'conf-2024')
    await expect(args.onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ edition: 'conf-2024' }),
    )
    await expect(
      canvas.getAllByRole('button', { name: 'Clear all filters' })[0],
    ).toBeVisible()
    await userEvent.selectOptions(select, 'conf-2026')
    await expect(args.onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ edition: undefined }),
    )
  },
}

/** A single-edition organization: the bar renders, without an edition control. */
export const SingleEdition: Story = {
  args: {
    initial: {},
    editions: { current: EDITIONS.current, previous: [] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getAllByRole('combobox', { name: 'Featured filter' })[0],
    ).toBeVisible()
    await expect(canvas.queryByRole('combobox', { name: 'Edition' })).toBeNull()
  },
}

/**
 * A deep link: `?edition=conf-2025` lands on that edition. The debounced text
 * filters must not fire on mount and wipe it (they did, for every deep link),
 * so the router is never asked to push a stripped URL.
 */
export const DeepLinkedEdition: Story = {
  args: { initial: {}, editions: EDITIONS, onChange: fn() },
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: {
        push: fn(),
        query: { edition: 'conf-2025' },
      },
    },
  },
  play: async ({ canvasElement, args, parameters }) => {
    const canvas = within(canvasElement)
    const select = canvas.getAllByRole('combobox', {
      name: 'Edition',
    })[0] as HTMLSelectElement
    await expect(select).toHaveValue('conf-2025')
    await expect(args.onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ edition: 'conf-2025' }),
    )
    // Wait past the 500ms debounce: still nothing pushed, still selected.
    await new Promise((resolve) => setTimeout(resolve, 700))
    await expect(select).toHaveValue('conf-2025')
    await expect(parameters.nextjs.navigation.push).not.toHaveBeenCalled()
  },
}
