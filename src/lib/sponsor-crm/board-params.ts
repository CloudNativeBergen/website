import type { BoardView } from '@/components/admin/sponsor-crm/BoardViewSwitcher'

const BOARD_VIEWS: BoardView[] = ['pipeline', 'contract', 'invoice']

/** The URL params the board's filter pills and "Clear all" own. */
export const BOARD_FILTER_PARAMS = [
  'tiers',
  'assignedTo',
  'team',
  'tags',
  'needsFollowUp',
  'action',
]

/** `?board=` as a view; anything unknown is the pipeline. */
export function boardViewFromParam(value: string | null): BoardView {
  return BOARD_VIEWS.includes(value as BoardView)
    ? (value as BoardView)
    : 'pipeline'
}

/** The query string with the filters removed and everything else kept. */
export function withoutBoardFilters(query: string): string {
  const params = new URLSearchParams(query)
  for (const key of BOARD_FILTER_PARAMS) params.delete(key)
  return params.toString()
}
