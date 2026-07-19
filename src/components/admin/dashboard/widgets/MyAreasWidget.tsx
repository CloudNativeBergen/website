'use client'

import { fetchMyAreasData } from '@/app/(admin)/admin/actions'
import { type MyAreasData } from '@/lib/dashboard/data-types'
import { BaseWidgetProps } from '@/lib/dashboard/types'
import { useWidgetData } from '@/hooks/dashboard/useWidgetData'
import { WidgetSkeleton, WidgetErrorState } from './shared'
import { MyAreasView } from './MyAreasView'

type MyAreasWidgetProps = BaseWidgetProps

/**
 * "My areas" (TEAMS-3, L4): a per-team card of needs-attention counts for the
 * teams the current organizer belongs to, each count deep-linking to the
 * filtered surface. Renders an inert empty state when the viewer is on no team —
 * a soft lens, never an access boundary. The presentational body lives in
 * {@link MyAreasView} (kept free of the server-action import so it stories).
 */
export function MyAreasWidget({ conference }: MyAreasWidgetProps) {
  const { data, loading, error, refetch } = useWidgetData<MyAreasData>(
    conference ? () => fetchMyAreasData(conference._id) : null,
    [conference],
  )

  if (loading) return <WidgetSkeleton />
  if (error) return <WidgetErrorState onRetry={refetch} />
  return <MyAreasView data={data} />
}
