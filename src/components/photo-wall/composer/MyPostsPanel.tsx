'use client'

import type {
  MyPost,
  MyPostDeletionStatus,
  MyPostMarketingStatus,
} from '@/lib/photo-wall/my-posts'
import { MyPostsSection, type MyPostsProps } from './MyPosts'
import { useMyPosts, type MyPostsReads } from './useMyPosts'

/** The three Server Actions of `/wall/post` My posts runs on (§8, §12). */
export interface MyPostsActions {
  getMyPosts: () => Promise<MyPost[]>
  deleteMyPost: (postId: string) => Promise<{ status: MyPostDeletionStatus }>
  setMyPostMarketing: (
    postId: string,
    consent: boolean,
  ) => Promise<{ status: MyPostMarketingStatus }>
}

export type MyPostsPanelProps = MyPostsActions

/**
 * My posts as a section of its own (Photo Wall spec §6.5, §12): the heading,
 * the list polled through `getMyPosts` ({@link useMyPosts}) and read again
 * after each Delete or Marketing change. Nothing at all while this phone has
 * no posts. The closed composer page shows it under See the wall; the open
 * composer runs the same hook itself, so a post it sends shows at once.
 */
export function MyPostsPanel({
  getMyPosts,
  deleteMyPost,
  setMyPostMarketing,
}: MyPostsPanelProps) {
  const mine = useMyPosts(getMyPosts)
  const actions = myPostsActions({ deleteMyPost, setMyPostMarketing }, mine)
  if (!mine.posts?.length) return null
  return (
    <MyPostsSection posts={mine.posts} listRead={mine.listRead} {...actions} />
  )
}

/**
 * The list's callbacks from the Server Actions: each runs the action and
 * reads the list again whatever the answer, so the card leaves or shows its
 * new state (§8: "after each action"). Each answer carries the reads started
 * before that read (`CardAnswer`): the card keeps what the action did only
 * until a list read after it comes in. `onDeleted` is told of a post that is
 * gone, before the list is read again.
 */
export function myPostsActions(
  { deleteMyPost, setMyPostMarketing }: Omit<MyPostsActions, 'getMyPosts'>,
  { refresh, readsStarted }: Pick<MyPostsReads, 'refresh' | 'readsStarted'>,
  onDeleted?: (postId: string) => void,
): Pick<MyPostsProps, 'onDelete' | 'onMarketing'> {
  return {
    onDelete: async (post) => {
      try {
        const { status } = await deleteMyPost(post._id)
        if (status !== 'failed') onDeleted?.(post._id)
        return { status, readsBefore: readsStarted() }
      } finally {
        void refresh()
      }
    },
    onMarketing: async (post, consent) => {
      try {
        const { status } = await setMyPostMarketing(post._id, consent)
        return { status, readsBefore: readsStarted() }
      } finally {
        void refresh()
      }
    },
  }
}
