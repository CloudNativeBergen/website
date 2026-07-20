'use client'

import dynamic from 'next/dynamic'

const StaffManager = dynamic(
  () => import('@/components/admin/StaffManager').then((m) => m.StaffManager),
  { ssr: false },
)

export default function Page() {
  return <StaffManager />
}
