import {
  buildCommentRequest,
  buildConversationRequest,
  buildWallPostRequest,
  JEV_MODEL,
  moderationQuestions,
  QUESTION_SET_VERSIONS,
  type ConversationRequest,
  type DecisionRequest,
  type ModerationRequest,
  type WallPhotoRequest,
} from '../../src/lib/content-judgement/questions'
import type {
  ConversationItem,
  DataItem,
  ModerationItem,
  ModerationSurface,
  Surface,
  WallPhotoItem,
} from './schema'

// The questions are production's (spec §4.2): this file only maps eval items
// onto the production builders, so the eval measures what production sends.
export {
  moderationQuestions,
  photoQuestions,
  conversationQuestions,
  type DecisionRequest,
  type WallPhotoRequest,
} from '../../src/lib/content-judgement/questions'

export const DEFAULT_MODEL = JEV_MODEL

/** The production question set each eval surface measures. */
export const SURFACE_QUESTION_SET = {
  'wall-caption': QUESTION_SET_VERSIONS.wallPost,
  'wall-photo': QUESTION_SET_VERSIONS.wallPost,
  'feedback-comment': QUESTION_SET_VERSIONS.feedbackComment,
  'conversation-opening': QUESTION_SET_VERSIONS.conversation,
} as const satisfies Record<Surface, string>

export function buildRequest(
  surface: 'wall-photo',
  item: WallPhotoItem,
  model?: string,
  imageBase64?: string,
): WallPhotoRequest
export function buildRequest(
  surface: ModerationSurface,
  item: ModerationItem,
  model?: string,
): ModerationRequest
export function buildRequest(
  surface: 'conversation-opening',
  item: ConversationItem,
  model?: string,
): ConversationRequest
export function buildRequest(
  surface: Surface,
  item: DataItem,
  model?: string,
  imageBase64?: string,
): DecisionRequest
export function buildRequest(
  surface: Surface,
  item: DataItem,
  model = DEFAULT_MODEL,
  imageBase64?: string,
): DecisionRequest {
  if (surface === 'wall-photo') {
    if (!('image' in item)) throw new Error('Wrong item type for wall-photo')
    return buildWallPostRequest({ caption: item.caption, imageBase64 }, model)
  }
  if (surface === 'conversation-opening') {
    if (!('category' in item))
      throw new Error('Wrong item type for conversation-opening')
    return buildConversationRequest(
      { subject: item.subject, message: item.text, openedBy: item.openedBy },
      model,
    )
  }
  if (!('labels' in item) || !('text' in item))
    throw new Error('Wrong item type for moderation surface')
  if (surface === 'feedback-comment')
    return buildCommentRequest(item.text, model)
  // Production never judges a caption alone (a Wall Post is one call), so the
  // caption-only eval shape is built here from the shared caption questions.
  return {
    model,
    questions: moderationQuestions['wall-caption'],
    state: { caption: item.text },
  }
}
