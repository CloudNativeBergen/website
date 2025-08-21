import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import GalleryPageWrapper from './client'

export default async function GalleryPage() {
  const { conference, error } = await getConferenceForCurrentDomain()
  
  if (error || !conference) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Conference Configuration Required</h1>
          <p className="text-gray-600">Please configure a conference in Sanity Studio before using the gallery feature.</p>
        </div>
      </div>
    )
  }

  return (
    <NotificationProvider>
      <GalleryPageWrapper conferenceId={conference._id} />
    </NotificationProvider>
  )
}