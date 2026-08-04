/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import type { Conference } from '@/lib/conference/types'

const getConferenceForCurrentDomain = vi.fn()

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: () => getConferenceForCurrentDomain(),
}))

const { TenantThemeStyle } = await import('./TenantThemeStyle')

const THEME = { primaryColor: '#7C3AED', accentColor: '#22D3EE' }

function conference(overrides: Partial<Conference> = {}): Conference {
  return {
    _id: 'conf-1',
    title: 'Tenant Conf',
    ...overrides,
  } as Conference
}

/** Render an async server component. */
async function renderAsync(element: Promise<React.ReactNode>) {
  return render(await element)
}

beforeEach(() => {
  getConferenceForCurrentDomain.mockReset()
})
afterEach(cleanup)

describe('TenantThemeStyle', () => {
  describe('with an explicitly passed conference', () => {
    it('injects the tenant brand vars', async () => {
      const { container } = await renderAsync(
        TenantThemeStyle({ conference: conference({ theme: THEME }) }),
      )
      const style = container.querySelector('style[data-tenant-theme]')
      expect(style?.innerHTML).toContain('--brand-primary:#7C3AED')
      expect(style?.innerHTML).toContain('--brand-accent:#22D3EE')
    })

    it('does not resolve the host again', async () => {
      await renderAsync(
        TenantThemeStyle({ conference: conference({ theme: THEME }) }),
      )
      expect(getConferenceForCurrentDomain).not.toHaveBeenCalled()
    })

    it('renders nothing for an unthemed conference', async () => {
      const { container } = await renderAsync(
        TenantThemeStyle({ conference: conference() }),
      )
      expect(container.querySelector('style')).toBeNull()
    })
  })

  describe('resolving the host itself', () => {
    it('injects the theme of the conference resolved for the host', async () => {
      getConferenceForCurrentDomain.mockResolvedValue({
        conference: conference({ theme: THEME }),
        domain: 'tenant.example',
        error: null,
      })
      const { container } = await renderAsync(TenantThemeStyle())
      expect(
        container.querySelector('style[data-tenant-theme]')?.innerHTML,
      ).toContain('--brand-primary:#7C3AED')
    })

    // FAIL CLOSED. `getConferenceForDomain` returns a TRUTHY `{} as Conference`
    // for a host that matches no `domains[]` entry, so a bare falsiness check
    // would never fire. An unresolvable host must render NO theme at all rather
    // than inherit whatever conference happened to be fetched.
    it('renders nothing when the host resolves to no conference', async () => {
      getConferenceForCurrentDomain.mockResolvedValue({
        conference: {} as Conference,
        domain: 'unknown.example',
        error: new Error('no conference for domain'),
      })
      const { container } = await renderAsync(TenantThemeStyle())
      expect(container.querySelector('style')).toBeNull()
    })

    it('renders nothing when resolution fails outright', async () => {
      getConferenceForCurrentDomain.mockResolvedValue({
        conference: {} as Conference,
        domain: 'broken.example',
        error: new Error('sanity unreachable'),
      })
      const { container } = await renderAsync(TenantThemeStyle())
      expect(container.querySelector('style')).toBeNull()
    })

    // A partial/secondary read failure alongside a VALID conference must not
    // strip the tenant's branding — same rule the canonical `isUnknownHost`
    // guard encodes for the rest of the site.
    it('still themes when an error accompanies a resolved conference', async () => {
      getConferenceForCurrentDomain.mockResolvedValue({
        conference: conference({ theme: THEME }),
        domain: 'tenant.example',
        error: new Error('gallery read failed'),
      })
      const { container } = await renderAsync(TenantThemeStyle())
      expect(container.querySelector('style[data-tenant-theme]')).not.toBeNull()
    })
  })
})
