'use client'

import { Suspense } from 'react'
import dynamic from 'next/dynamic'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

const SocialPostsManager = dynamic(
  () => import('@/components/admin/social').then((m) => m.SocialPostsManager),
  { ssr: false },
)

/**
 * `?variant=<id>` opens the copy-ready view for that variant: the deep link
 * the awaiting-manual notification carries (#1006).
 */
function PostsPage() {
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const variant = params.get('variant')
  return (
    <SocialPostsManager
      defaultManualId={variant}
      // Closing the view drops the param, so a second click on the same hub
      // link (or a reload after marking it posted) is not a stale reopen.
      onManualClosed={() => {
        if (variant) router.replace(pathname, { scroll: false })
      }}
    />
  )
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PostsPage />
    </Suspense>
  )
}
