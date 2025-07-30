'use client'

import { AppEnvironment } from '@/lib/environment'
import { BeakerIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'

export function DevBanner() {
  const [isVisible, setIsVisible] = useState(true)

  if (!AppEnvironment.isTestMode || !isVisible) return null

  return (
    <div
      style={{
        backgroundColor: '#fef3c7',
        borderBottom: '2px solid #f59e0b',
        padding: '8px 16px',
        position: 'relative',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
        }}
      >
        <BeakerIcon
          style={{ width: '20px', height: '20px', color: '#d97706' }}
          aria-hidden="true"
        />
        <span
          style={{
            fontSize: '14px',
            fontWeight: '600',
            color: '#92400e',
          }}
        >
          Test Mode Active
        </span>
        <span style={{ color: '#a16207', fontSize: '14px' }}>•</span>
        <span
          style={{
            fontSize: '14px',
            color: '#a16207',
          }}
        >
          Mock auth: {AppEnvironment.testUser.email}
        </span>

        <button
          type="button"
          onClick={() => setIsVisible(false)}
          style={{
            position: 'absolute',
            right: '16px',
            padding: '4px',
            backgroundColor: 'transparent',
            border: 'none',
            borderRadius: '4px',
            color: '#d97706',
            cursor: 'pointer',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = '#fbbf24'
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
          aria-label="Dismiss test mode banner"
        >
          <XMarkIcon
            style={{ width: '16px', height: '16px' }}
            aria-hidden="true"
          />
        </button>
      </div>
    </div>
  )
}
