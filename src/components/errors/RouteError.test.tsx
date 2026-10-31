/**
 * @vitest-environment jsdom
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { RouteError } from './RouteError'

afterEach(cleanup)

describe('RouteError', () => {
  it('announces the error and retries via reset()', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const reset = vi.fn()
    render(
      <RouteError
        error={Object.assign(new Error('boom'), { digest: 'abc123' })}
        reset={reset}
      />,
    )
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText(/abc123/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reset).toHaveBeenCalledOnce()
  })

  // #825: guard against the boundaries being silently deleted.
  it.each([
    'global-error.tsx',
    'error.tsx',
    '(main)/error.tsx',
    '(cfp)/error.tsx',
  ])('src/app/%s exists', (file) => {
    expect(existsSync(path.join(process.cwd(), 'src/app', file))).toBe(true)
  })
})
