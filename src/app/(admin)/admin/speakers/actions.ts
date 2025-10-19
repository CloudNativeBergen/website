'use server'

import { clientWrite } from '@/lib/sanity/client'
import { revalidatePath } from 'next/cache'
import { SpeakerInput, Speaker } from '@/lib/speaker/types'
import {
  getSpeaker,
  generateSlug,
  findSpeakerByEmail,
} from '@/lib/speaker/sanity'
import { getAuthSession } from '@/lib/auth'
import { v4 as randomUUID } from 'uuid'

export async function createSpeakerAsAdmin(
  speakerData: SpeakerInput,
  email: string,
): Promise<{ success: boolean; speaker?: Speaker; error?: string }> {
  try {
    const session = await getAuthSession()
    if (!session?.speaker?.is_organizer) {
      return { success: false, error: 'Unauthorized' }
    }

    if (
      !speakerData.name ||
      !email ||
      !speakerData.consent?.dataProcessing?.granted ||
      !speakerData.consent?.publicProfile?.granted
    ) {
      return { success: false, error: 'Missing required fields' }
    }

    const { speaker: existingByEmail } = await findSpeakerByEmail(email)
    if (existingByEmail) {
      return {
        success: false,
        error: `A speaker with email ${email} already exists. Please use edit mode to update their details.`,
      }
    }

    let slug = generateSlug(speakerData.name)

    const existingSpeaker = await clientWrite.fetch(
      `*[_type == "speaker" && slug.current == $slug][0]`,
      { slug },
    )

    if (existingSpeaker) {
      const suffix = randomUUID().slice(0, 8)
      slug = generateSlug(speakerData.name, suffix)
    }

    const assetId = speakerData.image
    const imageRef =
      assetId && assetId.startsWith('image-')
        ? {
            _type: 'image',
            asset: {
              _type: 'reference',
              _ref: assetId,
            },
          }
        : undefined

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createData: any = {
      _type: 'speaker',
      _id: randomUUID(),
      name: speakerData.name,
      bio: speakerData.bio,
      company: speakerData.company,
      title: speakerData.title,
      links: speakerData.links,
      flags: speakerData.flags,
      consent: speakerData.consent,
      email,
      slug: {
        _type: 'slug',
        current: slug,
      },
      providers: [],
      is_organizer: false,
    }

    if (imageRef) {
      createData.image = imageRef
    }

    const newSpeaker = await clientWrite.create(createData)

    const { speaker: createdSpeaker, err } = await getSpeaker(newSpeaker._id)
    if (err || !createdSpeaker) {
      throw new Error('Failed to retrieve created speaker')
    }

    revalidatePath('/admin/speakers')

    return { success: true, speaker: createdSpeaker }
  } catch (error) {
    console.error('Failed to create speaker:', error)
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to create speaker',
    }
  }
}

export async function updateSpeakerAsAdmin(
  speakerId: string,
  speakerData: SpeakerInput,
  email?: string,
): Promise<{ success: boolean; speaker?: Speaker; error?: string }> {
  try {
    const session = await getAuthSession()
    if (!session?.speaker?.is_organizer) {
      return { success: false, error: 'Unauthorized' }
    }

    if (
      !speakerData.name ||
      !speakerData.consent?.dataProcessing?.granted ||
      !speakerData.consent?.publicProfile?.granted
    ) {
      return { success: false, error: 'Missing required fields' }
    }

    const { speaker: existingSpeaker, err } = await getSpeaker(speakerId)
    if (err || !existingSpeaker) {
      return { success: false, error: 'Speaker not found' }
    }

    const updateData: Record<string, unknown> = {}

    if (speakerData.name !== undefined) {
      updateData.name = speakerData.name
    }

    if (speakerData.bio !== undefined) {
      updateData.bio = speakerData.bio
    }

    if (speakerData.company !== undefined) {
      updateData.company = speakerData.company
    }

    if (speakerData.title !== undefined) {
      updateData.title = speakerData.title
    }

    if (speakerData.links !== undefined) {
      updateData.links = speakerData.links
    }

    if (speakerData.flags !== undefined) {
      updateData.flags = speakerData.flags
    }

    if (speakerData.consent !== undefined) {
      updateData.consent = speakerData.consent
    }

    if (speakerData.image !== undefined) {
      const assetId = speakerData.image
      if (assetId && assetId.startsWith('image-')) {
        updateData.image = {
          _type: 'image',
          asset: {
            _type: 'reference',
            _ref: assetId,
          },
        }
      }
    }

    if (email !== undefined && email !== '') {
      updateData.email = email
    }

    await clientWrite.patch(speakerId).set(updateData).commit()

    const { speaker: updatedSpeaker, err: updateErr } =
      await getSpeaker(speakerId)
    if (updateErr || !updatedSpeaker) {
      throw new Error('Failed to retrieve updated speaker')
    }

    revalidatePath('/admin/speakers')
    revalidatePath('/admin/proposals')

    return { success: true, speaker: updatedSpeaker }
  } catch (error) {
    console.error('Failed to update speaker:', error)
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to update speaker',
    }
  }
}
