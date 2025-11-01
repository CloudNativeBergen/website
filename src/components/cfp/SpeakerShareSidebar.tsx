import { DashboardSidebar } from '@/components/cfp/DashboardSidebar'
import { SpeakerShareWrapper } from '@/components/cfp/SpeakerShareWrapper'
import { generateQRCode } from '@/components/SpeakerShare'
import type { SpeakerWithTalks } from '@/lib/speaker/types'

interface SpeakerShareSidebarProps {
  speaker: SpeakerWithTalks
  talkTitle: string
  eventName: string
}

export async function SpeakerShareSidebar({
  speaker,
  talkTitle,
  eventName,
}: SpeakerShareSidebarProps) {
  const speakerUrl = `/speaker/${speaker.slug || speaker._id}`
  const fullSpeakerUrl = `https://cloudnativebergen.dev${speakerUrl}`
  const qrCodeUrl = await generateQRCode(speakerUrl, 512)

  return (
    <div className="sticky top-4 space-y-4">
      <SpeakerShareWrapper
        speakerUrl={fullSpeakerUrl}
        talkTitle={talkTitle}
        eventName={eventName}
        speakerName={speaker.name}
        qrCodeUrl={qrCodeUrl}
        speaker={speaker}
        className="w-full"
      />

      <DashboardSidebar />
    </div>
  )
}
