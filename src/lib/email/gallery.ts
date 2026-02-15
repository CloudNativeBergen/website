import React from 'react'
import { render } from '@react-email/render'
import { GallerySpeakerTaggedTemplate } from '@/components/email/GallerySpeakerTaggedTemplate'
import { resend, retryWithBackoff } from './config'
import { buildGalleryImageUrl } from '@/lib/gallery/url'
import { logger } from '@/lib/logger'
import type { Speaker } from '@/lib/speaker/types'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'
import type { Conference } from '@/lib/conference/types'

export interface GalleryTagEmailRequest {
  speaker: Speaker
  image: GalleryImageWithSpeakers
  conference: Conference
  domain: string
}

export interface GalleryTagEmailResponse {
  success: boolean
  message: string
  emailId?: string
  recipient?: string
}

export async function sendGalleryTagEmail(
  request: GalleryTagEmailRequest,
): Promise<GalleryTagEmailResponse> {
  try {
    const { speaker, image, conference, domain } = request

    // Skip email sending in development mode
    if (process.env.NODE_ENV === 'development') {
      logger.info('Gallery tag email (development mode - not sent)', {
        speakerName: speaker.name,
        speakerEmail: speaker.email,
        imageId: image._id,
        eventName: conference.title,
        galleryUrl: buildGalleryImageUrl(domain, image._id),
      })
      return {
        success: true,
        message: 'Email skipped in development mode',
        recipient: speaker.email,
      }
    }

    // Validate required fields
    if (!speaker.email) {
      return {
        success: false,
        message: 'Speaker email is required',
      }
    }

    if (!image._id) {
      return {
        success: false,
        message: 'Image ID is required',
      }
    }

    // Build image URL from asset if imageUrl is missing
    const imageUrl = image.imageUrl
    if (!imageUrl && image.image?.asset) {
      // If we have the asset reference but no URL, we can't build it here
      // Log warning and continue with undefined URL
      logger.warn(
        'Image URL missing and cannot be built from asset reference',
        {
          imageId: image._id,
          hasAsset: !!image.image?.asset,
        },
      )
      return {
        success: false,
        message: 'Image URL is missing and cannot be derived',
      }
    }

    if (!imageUrl) {
      return {
        success: false,
        message: 'Image URL is required',
      }
    }

    if (
      !conference.title ||
      !conference.city ||
      !conference.startDate ||
      !conference.cfpEmail
    ) {
      return {
        success: false,
        message: 'Conference details are incomplete',
      }
    }

    const eventUrl = `https://${domain}`
    const galleryUrl = buildGalleryImageUrl(domain, image._id)
    const dashboardUrl = `${eventUrl}/cfp/list`

    // Use conference social links if available, otherwise fall back to defaults
    const defaultSocialLinks = [
      'https://twitter.com/cloudnativebergen',
      'https://www.linkedin.com/company/cloudnativebergen',
    ]
    const socialLinks =
      conference.socialLinks && conference.socialLinks.length > 0
        ? conference.socialLinks
        : defaultSocialLinks

    const emailHtml = await render(
      React.createElement(GallerySpeakerTaggedTemplate, {
        speakerName: speaker.name,
        imageUrl,
        imageAlt: image.imageAlt || image.image?.alt,
        eventName: conference.title,
        eventLocation: `${conference.city}, ${conference.country}`,
        eventDate: conference.startDate,
        eventUrl,
        galleryUrl,
        dashboardUrl,
        socialLinks,
      }),
    )

    const subject = `You've been tagged in a ${conference.title} photo`

    const result = await retryWithBackoff(async () => {
      return await resend.emails.send({
        from: `${conference.title} <${conference.cfpEmail}>`,
        to: speaker.email,
        subject,
        html: emailHtml,
      })
    })

    if (result.error) {
      logger.error('Failed to send gallery tag email', {
        error: result.error.message,
        speakerId: speaker._id,
        imageId: image._id,
      })
      return {
        success: false,
        message: `Failed to send email: ${result.error.message}`,
      }
    }

    logger.info('Gallery tag email sent successfully', {
      emailId: result.data?.id,
      imageId: image._id,
      speakerId: speaker._id,
      recipient: speaker.email,
    })

    return {
      success: true,
      message: 'Gallery tag notification sent successfully',
      emailId: result.data?.id,
      recipient: speaker.email,
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred'
    logger.error('Error sending gallery tag email', {
      error: errorMessage,
      speakerId: request.speaker._id,
      imageId: request.image._id,
    })
    return {
      success: false,
      message: `Failed to send gallery tag email: ${errorMessage}`,
    }
  }
}
