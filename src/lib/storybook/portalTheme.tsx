import { useEffect } from 'react'
import type { Decorator } from '@storybook/nextjs-vite'

/**
 * ModalShell (and any Headless UI Dialog) renders through a portal on
 * `document.body`, which escapes Storybook's theme-wrapper `<div class="dark">`.
 * This component mirrors the toolbar theme onto the document root so the
 * portaled modal's `dark:` classes resolve — in the app, next-themes puts the
 * class there.
 */
function PortalThemeSync({
  dark,
  children,
}: {
  dark: boolean
  children: React.ReactNode
}) {
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    return () => document.documentElement.classList.remove('dark')
  }, [dark])
  return <>{children}</>
}

/** Storybook decorator that syncs the toolbar theme onto `<html>` for portaled modals. */
export const withPortalTheme: Decorator = (Story, context) => (
  <PortalThemeSync dark={context.globals.theme === 'dark'}>
    <Story />
  </PortalThemeSync>
)
