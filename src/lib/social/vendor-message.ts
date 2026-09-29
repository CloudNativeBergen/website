import { truncateToGraphemeBoundary } from '@/lib/messaging/links'

/** A vendor's (Buffer's) error is free text; the full trail stays on the variant. */
export const VENDOR_MESSAGE_MAX = 300

/**
 * A vendor's error as SHOWN — in the hub notification and in the failure
 * notice (#1130). At most {@link VENDOR_MESSAGE_MAX} UTF-16 units, cut at a
 * grapheme boundary so an emoji or a combining mark is never split, with an
 * ellipsis when cut. Display only: the stored attempt keeps the whole message.
 */
export function capVendorMessage(text: string): string {
  return text.length > VENDOR_MESSAGE_MAX
    ? `${truncateToGraphemeBoundary(text, VENDOR_MESSAGE_MAX - 1)}…`
    : text
}
