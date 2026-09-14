'use client'

import { Suspense } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'

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
  return <SocialPostsManager defaultManualId={params.get('variant')} />
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PostsPage />
    </Suspense>
  )
}
