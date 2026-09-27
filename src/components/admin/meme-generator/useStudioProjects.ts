'use client'

import { useMemo } from 'react'
import { TRPCClientError } from '@trpc/client'
import { api } from '@/lib/trpc/client'
import { VideoProjectError, type VideoProjects } from './meme-generator-project'

/** A tRPC refusal as the editor's error: the message, and whether it conflicted. */
async function refusals<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  } catch (error) {
    if (error instanceof TRPCClientError) {
      const code = (error.data as { code?: string } | undefined)?.code
      throw new VideoProjectError(error.message, code === 'CONFLICT')
    }
    throw error
  }
}

/**
 * The studio's saved videos (docs/MARKETING_STUDIO_VIDEO_SPEC.md §7) as the
 * meme generator uses them. The organization is resolved on the server from
 * the request host for every call.
 */
export function useStudioProjects(): VideoProjects {
  const utils = api.useUtils()
  const create = api.videoProject.create.useMutation()
  const save = api.videoProject.save.useMutation()
  const duplicate = api.videoProject.duplicate.useMutation()
  const createAsync = create.mutateAsync
  const saveAsync = save.mutateAsync
  const duplicateAsync = duplicate.mutateAsync
  const remove = api.videoProject.delete.useMutation()
  const removeAsync = remove.mutateAsync
  return useMemo(
    () => ({
      // A fresh read every time: an older request still in flight is
      // cancelled, never reused for a refresh after a create or delete.
      list: () =>
        refusals(async () => {
          await utils.videoProject.list.cancel()
          return utils.videoProject.list.fetch(undefined, { staleTime: 0 })
        }),
      // Never from cache: a stale revision would make the next save conflict.
      open: (id) =>
        refusals(() => utils.videoProject.open.fetch({ id }, { staleTime: 0 })),
      create: (input) => refusals(() => createAsync(input)),
      save: (input) => refusals(() => saveAsync(input)),
      duplicate: (id) => refusals(() => duplicateAsync({ id })),
      delete: async (id) => {
        const { released, unsaveable } = await refusals(() =>
          removeAsync({ id }),
        )
        return { released, unsaveable }
      },
    }),
    [utils, createAsync, saveAsync, duplicateAsync, removeAsync],
  )
}
