/**
 * Studio's Duplicate copies every field of a document, read-only ones
 * included. A duplicated `sponsorForConference` would hold the same workshop
 * early-access token (#1346) and the same sponsor-portal token under an id of
 * its own, so Duplicate is removed for that type.
 */
import { describe, expect, it } from 'vitest'
import type { DocumentActionComponent } from 'sanity'
import { sponsorLinkSafeActions } from '../../sanity/actions/sponsorLinkSafeActions'
import studioConfig from '../../sanity.config'

const action = (name: string): DocumentActionComponent => {
  const component = (() => null) as unknown as DocumentActionComponent
  component.action = name as DocumentActionComponent['action']
  return component
}
const ALL = [
  action('publish'),
  action('duplicate'),
  action('delete'),
  action('unpublish'),
]
const names = (list: readonly DocumentActionComponent[]) =>
  list.map((a) => a.action)

describe('Studio cannot duplicate a sponsor of a conference', () => {
  it('drops Duplicate for sponsorForConference and keeps every other action', () => {
    expect(names(sponsorLinkSafeActions(ALL, 'sponsorForConference'))).toEqual([
      'publish',
      'delete',
      'unpublish',
    ])
  })

  it('leaves Duplicate alone on other types', () => {
    expect(names(sponsorLinkSafeActions(ALL, 'sponsor'))).toEqual(names(ALL))
  })

  it('is wired into the real Studio config', () => {
    const actions = studioConfig.document?.actions
    if (typeof actions !== 'function') {
      throw new Error('sanity.config.ts no longer configures document.actions')
    }
    const resolve = (schemaType: string) =>
      names(
        actions(ALL, {
          schemaType,
        } as unknown as Parameters<
          typeof actions
        >[1]) as DocumentActionComponent[],
      )

    // (The config wraps publish, so that entry carries no name here.)
    expect(resolve('sponsorForConference')).not.toContain('duplicate')
    expect(resolve('sponsorForConference')).toHaveLength(ALL.length - 1)
    // Still offered elsewhere.
    expect(resolve('sponsor')).toContain('duplicate')
    expect(resolve('sponsor')).toHaveLength(ALL.length)
  })
})
