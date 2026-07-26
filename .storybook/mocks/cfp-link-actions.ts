/**
 * Browser-safe Storybook stand-in for the 'use server' module
 * `@/app/(cfp)/cfp/profile/link-actions` (aliased in main.ts). The satisfies
 * check pins this stub to the REAL module's export surface at compile time, so
 * a signature/exports change there breaks the typecheck here instead of
 * silently drifting the stories.
 */
export async function startProviderLink(formData: FormData): Promise<void> {
  void formData
}

// Compile-time parity guard against the real module.
const _parity = {
  startProviderLink,
} satisfies typeof import('@/app/(cfp)/cfp/profile/link-actions')
void _parity
