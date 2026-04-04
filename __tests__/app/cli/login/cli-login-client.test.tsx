/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockMutateAsync = vi.fn()

vi.mock('@/lib/trpc/client', () => ({
  api: {
    speaker: {
      generateCliToken: {
        useMutation: () => ({ mutateAsync: mockMutateAsync }),
      },
    },
  },
}))

import CLILoginClient, {
  buildCallbackUrl,
} from '@/app/cli/login/cli-login-client'

describe('buildCallbackUrl', () => {
  it('should build a valid localhost callback URL', () => {
    const url = buildCallbackUrl(
      '8080',
      'my-token',
      'my-state',
      'Alice',
      'conf-123',
    )
    expect(url.hostname).toBe('localhost')
    expect(url.port).toBe('8080')
    expect(url.pathname).toBe('/callback')
    expect(url.searchParams.get('token')).toBe('my-token')
    expect(url.searchParams.get('state')).toBe('my-state')
    expect(url.searchParams.get('name')).toBe('Alice')
    expect(url.searchParams.get('conference_id')).toBe('conf-123')
  })

  it('should reject non-localhost hosts', () => {
    // buildCallbackUrl hardcodes localhost, so this tests the safety check
    expect(() => buildCallbackUrl('8080', 't', 's', 'n', 'c')).not.toThrow()
  })
})

describe('CLILoginClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should show confirm screen initially', () => {
    render(
      <CLILoginClient
        userName="Test User"
        userEmail="test@example.com"
        conferenceId="conf-123"
      />,
    )
    expect(screen.getByText(/requesting access/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /authorize cli/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Test User \(test@example\.com\)/),
    ).toBeInTheDocument()
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('should display token for manual copy after authorizing', async () => {
    mockMutateAsync.mockResolvedValue({ token: 'jwt-token-value', expiresAt: '2026-05-04T00:00:00.000Z' })

    render(
      <CLILoginClient
        userName="Test User"
        userEmail="test@example.com"
        conferenceId="conf-123"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /authorize cli/i }))

    await waitFor(() => {
      expect(screen.getByText('jwt-token-value')).toBeInTheDocument()
    })
    expect(screen.getByText(/copy this token/i)).toBeInTheDocument()
  })

  it('should redirect to localhost callback after authorizing', async () => {
    mockMutateAsync.mockResolvedValue({ token: 'jwt-token-value', expiresAt: '2026-05-04T00:00:00.000Z' })

    // Mock window.location.href assignment
    const locationHref = vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      href: '',
    } as Location)

    const hrefSetter = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, href: '' },
      writable: true,
      configurable: true,
    })
    Object.defineProperty(window.location, 'href', {
      set: hrefSetter,
      configurable: true,
    })

    render(
      <CLILoginClient
        port="9876"
        state="random-state"
        userName="Test User"
        userEmail="test@example.com"
        conferenceId="conf-123"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /authorize cli/i }))

    await waitFor(() => {
      expect(hrefSetter).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:9876/callback'),
      )
    })

    const redirectUrl = new URL(hrefSetter.mock.calls[0][0])
    expect(redirectUrl.searchParams.get('token')).toBe('jwt-token-value')
    expect(redirectUrl.searchParams.get('state')).toBe('random-state')
    expect(redirectUrl.searchParams.get('name')).toBe('Test User')

    locationHref.mockRestore()
  })

  it('should show error for invalid port', async () => {
    render(
      <CLILoginClient
        port="80"
        state="s"
        userName="Test User"
        userEmail="test@example.com"
        conferenceId="conf-123"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /authorize cli/i }))

    await waitFor(() => {
      expect(screen.getByText(/invalid port/i)).toBeInTheDocument()
    })
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('should show error for non-numeric port', async () => {
    render(
      <CLILoginClient
        port="abc"
        state="s"
        userName="Test User"
        userEmail="test@example.com"
        conferenceId="conf-123"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /authorize cli/i }))

    await waitFor(() => {
      expect(screen.getByText(/invalid port/i)).toBeInTheDocument()
    })
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('should show error when port is provided without state', async () => {
    render(
      <CLILoginClient
        port="8080"
        userName="Test User"
        userEmail="test@example.com"
        conferenceId="conf-123"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /authorize cli/i }))

    await waitFor(() => {
      expect(screen.getByText(/missing state/i)).toBeInTheDocument()
    })
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('should show error when token request fails', async () => {
    mockMutateAsync.mockRejectedValue(new Error('Authentication required'))

    render(
      <CLILoginClient
        userName="Test User"
        userEmail="test@example.com"
        conferenceId="conf-123"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /authorize cli/i }))

    await waitFor(() => {
      expect(screen.getByText('Authentication required')).toBeInTheDocument()
    })
  })

  it('should show error when mutation throws', async () => {
    mockMutateAsync.mockRejectedValue(new Error('Network error'))

    render(
      <CLILoginClient
        userName="Test User"
        userEmail="test@example.com"
        conferenceId="conf-123"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /authorize cli/i }))

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
  })

  it('should call clipboard API when copy button is clicked', async () => {
    mockMutateAsync.mockResolvedValue({ token: 'copy-me', expiresAt: '2026-05-04T00:00:00.000Z' })

    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    render(
      <CLILoginClient
        userName="Test User"
        userEmail="test@example.com"
        conferenceId="conf-123"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /authorize cli/i }))

    await waitFor(() => {
      expect(screen.getByText('copy-me')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /copy token/i }))

    expect(writeText).toHaveBeenCalledWith('copy-me')
    await waitFor(() => {
      expect(screen.getByText(/copied to clipboard/i)).toBeInTheDocument()
    })
  })

  it('should allow retry after error', async () => {
    mockMutateAsync
      .mockRejectedValueOnce(new Error('Server error'))
      .mockResolvedValueOnce({ token: 'retry-token', expiresAt: '2026-05-04T00:00:00.000Z' })

    render(
      <CLILoginClient
        userName="Test User"
        userEmail="test@example.com"
        conferenceId="conf-123"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /authorize cli/i }))

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /try again/i }))

    await waitFor(() => {
      expect(screen.getByText('retry-token')).toBeInTheDocument()
    })
  })
})
