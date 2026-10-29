/**
 * @vitest-environment node
 *
 * WHICH BANNER the signed-in portal shows (#1346, spec §7): one at most. The
 * page's own tests reach every combination the page can produce; this pins
 * the component for the ones it cannot, since the stories render it directly.
 *
 * The component is called and its tree read; the list, a client component, is
 * left as it was handed over.
 */
import { isValidElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import type { WorkshopRegistrationWindow } from '@/lib/workshop/registration-window'
import {
  WorkshopEarlyAccessBanner,
  WorkshopEarlyAccessInvalidNotice,
} from './WorkshopEarlyAccess'
import { WorkshopPortal } from './WorkshopPortal'

type Element = React.ReactElement<Record<string, unknown>>

function elementsOf(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elementsOf)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  if (
    node.type === WorkshopEarlyAccessBanner ||
    node.type === WorkshopEarlyAccessInvalidNotice
  ) {
    return elementsOf((node.type as (props: unknown) => ReactNode)(node.props))
  }
  return [node, ...elementsOf(node.props.children as ReactNode)]
}

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return textOf(node.props.children)
  }
  return ''
}

/** The banners and status lines the portal shows, top to bottom. */
function shown(
  registration: WorkshopRegistrationWindow,
  earlyAccess: { sponsorName: string | null } | null,
  earlyAccessInvalid = false,
) {
  const elements = elementsOf(
    WorkshopPortal({
      conferenceTitle: 'CNDN',
      userWorkOSId: 'workos-1',
      userEmail: 'ada@example.com',
      userName: 'Ada Lovelace',
      times: {},
      registration,
      earlyAccess,
      earlyAccessInvalid,
      signOutAction: async () => {},
    }),
  )
  return elements
    .filter((el) => el.type === 'h2' || el.props.role === 'status')
    .map((el) => textOf(el).replace(/\s+/g, ' ').trim())
}

const ACME = { sponsorName: 'Acme AS' }
const OFFICIAL = 'Workshop registration is not yet open'
const CLOSED = 'Workshop registration has closed'

describe('the banner of the signed-in portal', () => {
  it('with early access before the sponsor start time: the early-access banner, not the official one', () => {
    expect(
      shown(
        {
          status: 'not-open-yet',
          opensAt: '2026-06-12T07:00:00.000Z',
          early: true,
        },
        ACME,
      ),
    ).toEqual([
      'Early access through Acme AS opens Friday, June 12, 2026 at 9:00 AM',
    ])
  })

  it('with early access inside the window: the line that says so', () => {
    expect(shown({ status: 'open', early: true }, ACME)).toEqual([
      'You have early access through Acme AS',
    ])
  })

  it('without early access before the official opening: the official banner', () => {
    expect(
      shown(
        {
          status: 'not-open-yet',
          opensAt: '2026-06-14T22:30:00.000Z',
          early: false,
        },
        null,
      ),
    ).toEqual([OFFICIAL])
  })

  it('after the end: that sign-up has closed, and nothing about early access', () => {
    expect(
      shown({ status: 'closed', closedAt: '2026-06-01T07:00:00.000Z' }, ACME),
    ).toEqual([CLOSED])
  })

  it('the notice for a link that is not live comes first, beside whichever banner applies', () => {
    expect(
      shown(
        {
          status: 'not-open-yet',
          opensAt: '2026-06-14T22:30:00.000Z',
          early: false,
        },
        null,
        true,
      ),
    ).toEqual([
      'This early access link is no longer valid. Ask whoever sent it to you for a new one.',
      OFFICIAL,
    ])
  })
})
