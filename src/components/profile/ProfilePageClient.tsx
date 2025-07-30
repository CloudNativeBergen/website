'use client'

import { useState } from 'react'
import { Speaker } from '@/lib/speaker/types'
import { useProfile } from '@/hooks/useProfile'
import { useEmails } from '@/hooks/useEmails'
import { SpeakerProfileForm } from '@/components/profile/SpeakerProfileForm'
import { ProfileImageUpload } from '@/components/profile/ProfileImageUpload'
import { ProfileLinksManager } from '@/components/profile/ProfileLinksManager'
import { ProfileSkeleton } from '@/components/profile/ProfileSkeleton'
import { ProfileError } from '@/components/profile/ProfileError'
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'

interface ProfilePageClientProps {
  initialSpeaker: Speaker
}

export function ProfilePageClient({ initialSpeaker }: ProfilePageClientProps) {
  const { profile, loading, error, refreshProfile, updateProfile } = useProfile()
  const { emails } = useEmails()
  const [activeTab, setActiveTab] = useState<'profile' | 'image' | 'links'>(
    'profile',
  )

  // Use initialSpeaker as fallback if profile hasn't loaded yet
  const speaker = profile || initialSpeaker

  if (loading && !profile) {
    return <ProfileSkeleton />
  }

  if (error && !profile) {
    return <ProfileError message={error} onRetry={refreshProfile} />
  }

  const tabs = [
    { id: 'profile', label: 'Profile Information' },
    { id: 'image', label: 'Profile Picture' },
    { id: 'links', label: 'Social Links' },
  ] as const

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">
            Your Speaker Profile
          </h1>
          {speaker.slug && (
            <div className="flex flex-col items-end gap-1">
              <a
                href={`/speaker/${speaker.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:ring-2 focus:ring-brand-cloud-blue focus:ring-offset-2 focus:outline-none"
              >
                View Public Profile
                <ArrowTopRightOnSquareIcon className="ml-2 h-4 w-4" />
              </a>
              <p className="text-xs text-gray-500">
                Only visible after talks are confirmed
              </p>
            </div>
          )}
        </div>
        <p className="mt-2 text-sm text-gray-600">
          Manage your speaker information and how you appear to attendees
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 px-1 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-brand-cloud-blue text-brand-cloud-blue'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              } `}
              aria-current={activeTab === tab.id ? 'page' : undefined}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-8">
        {activeTab === 'profile' && (
          <div className="rounded-lg bg-white shadow">
            <div className="p-6">
              <h2 className="mb-6 text-lg font-medium text-gray-900">
                Profile Information
              </h2>
              <div className="space-y-4">
                {/* Display Email (read-only) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Email Address
                  </label>
                  <div className="mt-1 flex items-center">
                    <input
                      type="email"
                      value={emails?.[0]?.email || speaker.email || ''}
                      className="block w-full rounded-md border-gray-300 bg-gray-50 shadow-sm sm:text-sm"
                      disabled
                      readOnly
                    />
                    <span className="ml-3 text-sm text-gray-500">
                      Managed by your OAuth provider
                    </span>
                  </div>
                </div>

                {/* Profile Form */}
                <SpeakerProfileForm speaker={speaker} />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'image' && (
          <div className="rounded-lg bg-white shadow">
            <div className="p-6">
              <h2 className="mb-6 text-lg font-medium text-gray-900">
                Profile Picture
              </h2>
              <ProfileImageUpload
                currentImage={speaker.image || speaker.imageURL}
                speakerName={speaker.name}
              />
            </div>
          </div>
        )}

        {activeTab === 'links' && (
          <div className="rounded-lg bg-white shadow">
            <div className="p-6">
              <h2 className="mb-6 text-lg font-medium text-gray-900">
                Social Links
              </h2>
              <ProfileLinksManager
                initialLinks={speaker.links || []}
                onUpdate={async (links: string[]) => {
                  await updateProfile({ ...speaker, links })
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
