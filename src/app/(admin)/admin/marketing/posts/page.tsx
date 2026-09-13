'use client'

import dynamic from 'next/dynamic'

const SocialPostsManager = dynamic(
  () => import('@/components/admin/social').then((m) => m.SocialPostsManager),
  { ssr: false },
)

export default function Page() {
  return <SocialPostsManager />
}
