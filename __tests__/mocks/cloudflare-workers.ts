// `cloudflare:workers` has no Node resolution. Tests that care about `env` or
// `waitUntil` set them here or vi.mock the module themselves.
export const env: Record<string, unknown> = {}
export const waitUntil = (p: Promise<unknown>) => void p
export class WorkerEntrypoint {}
