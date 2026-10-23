'use client'

import { AdminPageLoading } from '@/components/admin/PageLoadingSkeleton'
import { api } from '@/lib/trpc/client'
import { PhotoWallAdmin } from './PhotoWallAdmin'

/**
 * `/admin/photo-wall` (Photo Wall spec §10): reads `photoWall.settings` and
 * wires Set up and the switches to their procedures. Each answer is the
 * wall as the server now has it, so it replaces the read in place.
 */
export function PhotoWallAdminPage({
  conferenceTitle,
}: {
  conferenceTitle?: string
}) {
  const utils = api.useUtils()
  const settings = api.photoWall.settings.useQuery(undefined, {
    refetchOnWindowFocus: true,
  })
  const onSuccess = async (
    view: NonNullable<typeof settings.data>,
  ): Promise<void> => {
    // A read started before the write could land after it, older.
    await utils.photoWall.settings.cancel()
    utils.photoWall.settings.setData(undefined, view)
  }
  const setUp = api.photoWall.setUp.useMutation({ onSuccess })
  const update = api.photoWall.updateSettings.useMutation({
    onSuccess,
    // The switch may have changed elsewhere: show what the server has.
    onError: () => void utils.photoWall.settings.invalidate(),
  })

  if (settings.isPending) return <AdminPageLoading />
  if (!settings.data)
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
        <p className="text-sm text-red-800 dark:text-red-300">
          Could not load the Photo Wall: {settings.error?.message}
        </p>
      </div>
    )
  return (
    <PhotoWallAdmin
      view={settings.data}
      conferenceTitle={conferenceTitle}
      onSetUp={() => setUp.mutate()}
      onChange={(change) => update.mutate(change)}
      saving={setUp.isPending || update.isPending}
      failed={setUp.isError || update.isError}
    />
  )
}
