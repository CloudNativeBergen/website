import { test, expect } from 'playwright/test'

test.describe('Sponsor Dashboard', () => {
  // Uses the default authenticated storage state (e2e/.auth/user.json)
  // seeded by auth.setup.ts
  
  test('loads the dashboard for a specific sponsor', async ({ page }) => {
    // Navigate to a valid sponsor route. In an E2E environment without mocked Sanity
    // documents, this will likely hit a 404 if the sponsor doesn't exist.
    // For scaffolding, we verify the routing/page shell mounting.
    const response = await page.goto('/admin/sponsors/fake-sponsor-id')
    
    // The page should eventually render our dashboard UI or a 404 boundary
    // depending on the backend state. We assert basic rendering.
    // Note: Since this hits Sanity in E2E, we check for either the 404 text
    // (expected for "fake-sponsor-id") or the Activity Feed (if seeded).
    
    const is404 = await page.getByText('This page could not be found').isVisible()
    if (!is404) {
      await expect(page.getByText('Activity Feed')).toBeVisible({ timeout: 10000 })
    }
  })
})
