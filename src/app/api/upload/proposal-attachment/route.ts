import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextResponse } from 'next/server'
import { NextAuthRequest, auth } from '@/lib/auth'
import { getProposal } from '@/lib/proposal/data/sanity'

/**
 * REST API endpoint for generating Vercel Blob upload tokens.
 *
 * ## Why REST API instead of tRPC?
 *
 * This endpoint MUST be a REST API route because it's part of Vercel Blob's
 * client-side upload architecture. The @vercel/blob/client upload() function
 * requires a handleUploadUrl that points to an API route using handleUpload().
 *
 * ## Architecture Flow:
 * 1. Client calls upload() from @vercel/blob/client
 * 2. upload() makes HTTP request to this REST endpoint (handleUploadUrl)
 * 3. This endpoint validates and generates a client token via handleUpload()
 * 4. Client receives token and uploads directly to Vercel Blob
 * 5. Client then calls tRPC endpoint (proposal.uploadAttachment) for business logic
 *
 * ## Why not tRPC?
 * - handleUpload() is designed to work with Next.js Request/Response objects
 * - The client-side upload() function expects a standard HTTP endpoint
 * - tRPC is used for the business logic (Blob→Sanity transfer) which provides
 *   type safety where it matters most
 *
 * ## Responsibilities:
 * - Authentication verification (NextAuth)
 * - Proposal ownership verification (before token generation)
 * - Pathname format validation
 * - File type restrictions (PDF, PPTX, PPT, ODP, KEY)
 * - Size limit enforcement (50MB)
 * - Token generation (via handleUpload)
 *
 * ## Security (Defense in Depth):
 * - Protected by NextAuth authentication
 * - Verifies proposal ownership BEFORE generating upload token
 * - Validates pathname format: proposal-{id}-{timestamp}-{filename}
 * - Token payload includes proposalId and speakerId for verification
 * - Additional ownership verification in tRPC endpoint (proposal.uploadAttachment)
 *
 * @see /docs/ATTACHMENT_STORAGE.md for complete architecture documentation
 * @see src/server/routers/proposal.ts (proposal.uploadAttachment) for transfer logic
 */
export const POST = auth(async (req: NextAuthRequest) => {
  if (
    !req.auth ||
    !req.auth.user ||
    !req.auth.speaker ||
    !req.auth.speaker._id
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: HandleUploadBody
  try {
    body = (await req.json()) as HandleUploadBody
  } catch (parseError) {
    console.error('Failed to parse request body:', parseError)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith('proposal-')) {
          throw new Error(
            'Invalid pathname format: must start with "proposal-"',
          )
        }

        const parts = pathname.split('-')
        if (parts.length < 3) {
          throw new Error('Invalid pathname format: insufficient parts')
        }

        const proposalId = parts[1]
        if (!proposalId || proposalId.length === 0) {
          throw new Error('Invalid pathname format: missing proposal ID')
        }

        const { proposal, proposalError } = await getProposal({
          id: proposalId,
          speakerId: req.auth?.speaker?._id,
          isOrganizer: req.auth?.speaker?.is_organizer === true,
        })

        if (proposalError || !proposal) {
          throw new Error('Proposal not found or access denied')
        }

        return {
          allowedContentTypes: [
            'application/pdf',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'application/vnd.oasis.opendocument.presentation',
            'application/x-iwork-keynote-sffkey',
          ],
          maximumSizeInBytes: 50 * 1024 * 1024,
          tokenPayload: JSON.stringify({
            proposalId,
            speakerId: req.auth?.speaker?._id,
            uploadedAt: new Date().toISOString(),
          }),
        }
      },
      onUploadCompleted: async () => {},
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    console.error('Upload token generation error:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate upload token',
      },
      { status: 400 },
    )
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any
