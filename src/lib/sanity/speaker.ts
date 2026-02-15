import { groq } from 'next-sanity'
import { clientReadCached } from '@/lib/sanity/client'
import type { Speaker } from '@/lib/speaker/types'

export async function getSpeakerByEmail(
  email: string,
): Promise<Speaker | null> {
  try {
    const query = groq`
      *[_type == "speaker" && email == $email][0] {
        _id,
        name,
        email,
        isOrganizer,
        "image": image.asset->url,
        "slug": slug.current
      }
    `

    const speaker = await clientReadCached.fetch(query, { email })
    return speaker || null
  } catch (error) {
    console.error('Error fetching speaker by email:', error)
    return null
  }
}
