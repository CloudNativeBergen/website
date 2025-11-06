/**
 * Mock for uuid package
 * Provides deterministic UUIDs for testing
 */

let counter = 0

export function v4(): string {
  return `00000000-0000-0000-0000-${String(counter++).padStart(12, '0')}`
}

// Reset counter for test isolation
export function resetCounter(): void {
  counter = 0
}
