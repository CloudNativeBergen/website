'use client'

import dynamic from 'next/dynamic'

const VolunteerAdminPage = dynamic(
  () => import('@/components/volunteer').then((m) => m.VolunteerAdminPage),
  { ssr: false },
)

export default function Page() {
  return <VolunteerAdminPage />
}
