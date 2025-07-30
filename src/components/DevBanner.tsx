'use client'

import { AppEnvironment } from '@/lib/environment'

export function DevBanner() {
  if (!AppEnvironment.isTestMode) return null

  return (
    <div className="border-b bg-yellow-500 p-2 text-center font-semibold text-yellow-900">
      🧪 Test Mode Active - Using mock authentication (
      {AppEnvironment.testUser.email})
    </div>
  )
}
