/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { SignInProviderButtons } from './SignInProviderButtons'

const providers = [
  { id: 'github', name: 'GitHub' },
  { id: 'linkedin', name: 'LinkedIn' },
]

describe('SignInProviderButtons', () => {
  it('links each provider to the identity handoff when flagged', () => {
    const signInAction = vi.fn(async () => {})
    render(
      <SignInProviderButtons
        providers={providers}
        handoff
        signInAction={signInAction}
      />,
    )
    expect(
      screen.getByRole('link', { name: /GitHub/ }).getAttribute('href'),
    ).toBe('/api/auth/handoff?provider=github')
    expect(
      screen.getByRole('link', { name: /LinkedIn/ }).getAttribute('href'),
    ).toBe('/api/auth/handoff?provider=linkedin')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('posts the NextAuth action with the provider id when not flagged', async () => {
    const signInAction = vi.fn<(id: string, form?: FormData) => Promise<void>>(
      async () => {},
    )
    render(
      <SignInProviderButtons
        providers={providers}
        handoff={false}
        signInAction={signInAction}
      />,
    )
    expect(screen.queryByRole('link')).toBeNull()
    await act(async () => {
      screen.getByRole('button', { name: /LinkedIn/ }).click()
    })
    await vi.waitFor(() =>
      expect(signInAction.mock.calls[0]?.[0]).toBe('linkedin'),
    )
  })
})
