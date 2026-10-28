import { SpeakerShareWrapper } from '@/components/cfp/SpeakerShareWrapper'
import { generateQRCode } from '@/components/SpeakerShare'
import type { SpeakerWithTalks } from '@/lib/speaker/types'
import { speakerPath } from '@/lib/speaker/path'

interface SpeakerShareSidebarProps {
  speaker: SpeakerWithTalks
  talkTitle: string
  eventName: string
  /** Hashtag and account to end the post with. */
  tags?: string | null
  baseDomain?: string
}

export async function SpeakerShareSidebar({
  speaker,
  talkTitle,
  eventName,
  tags,
  baseDomain,
}: SpeakerShareSidebarProps) {
  const speakerUrl = speakerPath(speaker.slug) || '/speaker'
  const fullSpeakerUrl = baseDomain
    ? `https://${baseDomain}${speakerUrl}`
    : speakerUrl
  const qrCodeUrl = await generateQRCode(speakerUrl, 512, baseDomain)

  return (
    <SpeakerShareWrapper
      speakerUrl={fullSpeakerUrl}
      talkTitle={talkTitle}
      eventName={eventName}
      tags={tags}
      speakerName={speaker.name}
      qrCodeUrl={qrCodeUrl}
      speaker={speaker}
      className="w-full"
    />
  )
}
