/**
 * @vitest-environment jsdom
 *
 * Behavioural tests for the presentational install panels
 * (src/components/pwa/InstallGuide.tsx `InstallGuidePanel`). The pure
 * platform -> view mapping is covered in installView.test.ts; this pins that
 * each resolved view renders the right guidance and that the Chromium view's
 * button invokes the install callback.
 */
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InstallGuidePanel } from '@/components/pwa/InstallGuide'

afterEach(cleanup)

describe('InstallGuidePanel', () => {
  it('installed: confirms and shows no install control', () => {
    render(<InstallGuidePanel view="installed" />)
    expect(screen.getByText(/you.?re all set/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /install/i }),
    ).not.toBeInTheDocument()
  })

  it('chromium: renders an Install button that invokes onInstall', () => {
    const onInstall = vi.fn()
    render(<InstallGuidePanel view="chromium" onInstall={onInstall} />)
    const button = screen.getByRole('button', {
      name: /install cloud native days/i,
    })
    fireEvent.click(button)
    expect(onInstall).toHaveBeenCalledOnce()
  })

  it('ios-safari: shows the three-step Add-to-Home-Screen walkthrough', () => {
    render(<InstallGuidePanel view="ios-safari" />)
    expect(screen.getByText(/add to your home screen/i)).toBeInTheDocument()
    // Three ordered steps.
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(3)
    expect(screen.getByLabelText('Share')).toBeInTheDocument()
  })

  it('ios-other: tells the user to open in Safari', () => {
    render(<InstallGuidePanel view="ios-other" />)
    expect(screen.getByText(/open in safari to install/i)).toBeInTheDocument()
  })

  it('desktop-generic: points at the browser install affordance', () => {
    render(<InstallGuidePanel view="desktop-generic" />)
    expect(screen.getByText(/install from your browser/i)).toBeInTheDocument()
  })
})
