import type { TestRunnerConfig } from '@storybook/test-runner'
import { getStoryContext } from '@storybook/test-runner'

/**
 * Sizes for the viewport names our stories use.
 *
 * The viewport ADDON only resizes the preview iframe inside the Storybook UI.
 * The test runner drives the story URL directly, so the addon never runs and
 * the page keeps Playwright's default 1280x720 — which means a story that says
 * `defaultViewport: 'mobile1'` is tested at DESKTOP width.
 *
 * That is not a cosmetic difference. Any play function that reaches for a
 * control which only exists below a breakpoint fails with "Unable to find
 * role=button and name X", and the story looks broken when the component is
 * fine. The composer's `[Compose | Preview]` toggle (rendered only below `lg`)
 * hit exactly this. Resizing the real page here makes the breakpoint true.
 */
const VIEWPORT_SIZES: Record<string, { width: number; height: number }> = {
  mobile1: { width: 320, height: 568 },
  mobile2: { width: 414, height: 896 },
  tablet: { width: 834, height: 1112 },
}

const DEFAULT_SIZE = { width: 1280, height: 720 }

const config: TestRunnerConfig = {
  async preVisit(page, story) {
    const context = await getStoryContext(page, story)
    const name = (
      context.parameters?.viewport as { defaultViewport?: string } | undefined
    )?.defaultViewport

    // Always set a size, including the default one: the runner reuses a page
    // across stories, so a narrow story would otherwise leak its width into
    // whichever story ran next and fail it in a way that depends on ORDER.
    await page.setViewportSize((name && VIEWPORT_SIZES[name]) || DEFAULT_SIZE)
  },
}

export default config
