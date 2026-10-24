'use client'

import type { MyPost } from '@/lib/photo-wall/my-posts'
import { MyPosts, type MyPostsProps } from './MyPosts'
import { useMyPosts } from './useMyPosts'

/** The three Server Actions of `/wall/post` My posts runs on (§8, §12). */
export interface MyPostsActions {
  getMyPosts: () => Promise<MyPost[]>
  deleteMyPost: (
    postId: string,
  ) => Promise<{ status: 'deleted' | 'failed' | 'gone' }>
  setMyPostMarketing: (
    postId: string,
    consent: boolean,
  ) => Promise<{ status: 'done' | 'changed' | 'gone' }>
}

export interface MyPostsPanelProps extends MyPostsActions {
  /** The heading over the list; `h2` under a page's own heading. */
  as?: 'h1' | 'h2'
}

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
  as: Heading = 'h2',
}: MyPostsPanelProps) {
  const { posts, refresh } = useMyPosts(getMyPosts)
  const actions = myPostsActions({ deleteMyPost, setMyPostMarketing }, refresh)
  if (!posts?.length) return null
  return (
    <section aria-labelledby="my-posts" className="mt-10">
      <Heading
        id="my-posts"
        className="font-display text-xl font-semibold text-gray-900 dark:text-gray-100"
      >
        My posts
      </Heading>
      <div className="mt-6">
        <MyPosts posts={posts} {...actions} />
      </div>
    </section>
  )
}

/**
 * The list's callbacks from the Server Actions: each runs the action and
 * reads the list again whatever the answer, so the card leaves or shows its
 * new state (§8: "after each action").
 */
export function myPostsActions(
  { deleteMyPost, setMyPostMarketing }: Omit<MyPostsActions, 'getMyPosts'>,
  refresh: () => Promise<void>,
): Pick<MyPostsProps, 'onDelete' | 'onMarketing'> {
  return {
    onDelete: async (post) => {
      try {
        return (await deleteMyPost(post._id)).status
      } finally {
        void refresh()
      }
    },
    onMarketing: async (post, consent) => {
      try {
        return (await setMyPostMarketing(post._id, consent)).status
      } finally {
        void refresh()
      }
    },
  }
}
