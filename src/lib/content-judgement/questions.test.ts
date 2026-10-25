/**
 * The eval measures what production sends (spec §4.2, §15): for one item per
 * production surface, the eval runner's request and the production builder's
 * are byte-identical. The eval side maps a labelled item; the production side
 * is handed the same values the way a judging task will hand them over.
 */
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { buildRequest } from '../../../evals/content-judgement/questions'
import { loadData } from '../../../evals/content-judgement/schema'
import {
  buildCommentRequest,
  buildConversationRequest,
  buildWallPostRequest,
  QUESTION_SET_VERSIONS,
} from './questions'

const bytes = (value: unknown) => JSON.stringify(value)
const sha256 = (value: unknown) =>
  createHash('sha256').update(bytes(value)).digest('hex')

describe('eval and production build the same request', () => {
  it('feedback comment', () => {
    const item = loadData('feedback-comment')[0]
    expect(bytes(buildCommentRequest(item.text))).toBe(
      bytes(buildRequest('feedback-comment', item)),
    )
  })

  it('Wall Post with a caption', () => {
    const item = loadData('wall-photo').find((i) => i.caption !== undefined)!
    expect(
      bytes(
        buildWallPostRequest({ caption: item.caption, imageBase64: 'AAEC' }),
      ),
    ).toBe(bytes(buildRequest('wall-photo', item, undefined, 'AAEC')))
  })

  it('Wall Post without a caption', () => {
    const item = loadData('wall-photo').find((i) => i.caption === undefined)!
    expect(bytes(buildWallPostRequest({ imageBase64: 'AAEC' }))).toBe(
      bytes(buildRequest('wall-photo', item, undefined, 'AAEC')),
    )
  })

  it('Conversation opening', () => {
    const item = loadData('conversation-opening')[0]
    expect(
      bytes(
        buildConversationRequest({
          subject: item.subject,
          message: item.text,
          openedBy: item.openedBy,
        }),
      ),
    ).toBe(bytes(buildRequest('conversation-opening', item)))
  })
})

/**
 * A wording change must come with a version bump, because every bar in §11
 * is measured per question set. These hashes are of the wording the committed
 * eval runs measured (comment and conversation at v2, Wall Post at v4); a
 * failure here means: bump the surface's version, re-run the eval, then
 * update the hash.
 */
describe('question wording is pinned to its version', () => {
  it.each([
    [
      'feedbackComment',
      'v2',
      () => buildCommentRequest('x').questions,
      '65b9cb68b3b4bc100713873e3817d8b7e2093d4b03d2e3acbdbb08fec4922034',
    ],
    [
      'wallPost',
      'v4',
      () => buildWallPostRequest({ caption: 'x' }).questions,
      '84f4c0cb2da8fed007e5dbc80fb64e88e99690cf986f294c5b69081d0b52f303',
    ],
    [
      'conversation',
      'v2',
      () =>
        buildConversationRequest({
          subject: 'x',
          message: 'x',
          openedBy: 'speaker',
        }).questions,
      'b656fe9f4c8adf03215221d0c72439ccb64c7a21e88b0c5f8285fb9c3bb8b98b',
    ],
  ] as const)('%s %s', (surface, version, questions, hash) => {
    expect(QUESTION_SET_VERSIONS[surface]).toBe(version)
    expect(sha256(questions())).toBe(hash)
  })
})
