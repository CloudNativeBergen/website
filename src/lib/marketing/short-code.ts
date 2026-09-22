/**
 * SHORT LINK CODES — pure (spec `MARKETING_SHORT_LINKS_SPEC.md` §2.2).
 *
 * Six characters from `abcdefghjkmnpqrstuvwxyz23456789` — lowercase, without
 * the five characters that read ambiguously in a pasted or dictated link
 * (`0 o 1 l i`). About 887 million codes per conference (31^6).
 *
 * A code is unique within a conference across BOTH document types that carry
 * one (`socialPostVariant.shortCode`, `marketingTask.shortCode`), never changed
 * once minted, and never editable.
 *
 * `materializeTask` is pure and builds whole batches, so it cannot mint: its
 * callers mint and pass the codes in, exactly as they already do for ids.
 * {@link createShortCodeMinter} is that batch mint — it is given the
 * conference's existing codes (ONE query) and checks each draw against them AND
 * against everything it has already handed out, redrawing a hit.
 *
 * No `node:crypto` import: this module is reachable from seeding, which the
 * admin Storybook stories import. `globalThis.crypto` is present in Node 19+,
 * the Edge runtime and the browser.
 */

export const SHORT_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
export const SHORT_CODE_LENGTH = 6

/**
 * The shape a `/go/<code>` path segment must have AFTER lowercasing. It is
 * written as a character class rather than built from the alphabet so the
 * route's guard is a literal, greppable regex; `short-code.test.ts` pins the
 * two against each other.
 */
const SHORT_CODE_SHAPE = /^[a-hjkmnp-z2-9]{6}$/

/**
 * How many times a draw may collide before the mint gives up. At 887M codes
 * against a conference's few thousand, exhausting this means the random source
 * is broken — and returning a duplicate would send one Task's short link to
 * another Task's destination, so this throws instead.
 */
const MAX_DRAWS = 64

/**
 * A `[0, 1)` float from 32 cryptographic bits. The residual modulo bias over 31
 * buckets is ~31/2^32 and is irrelevant for collision avoidance, which is what
 * the code needs; nothing here is a secret or a capability.
 */
function secureRandom(): number {
  const bits = new Uint32Array(1)
  globalThis.crypto.getRandomValues(bits)
  return bits[0] / 2 ** 32
}

/** One fresh code. Uniqueness is the minter's job, not this function's. */
export function drawShortCode(random: () => number = secureRandom): string {
  let code = ''
  for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
    code += SHORT_CODE_ALPHABET.charAt(
      Math.floor(random() * SHORT_CODE_ALPHABET.length),
    )
  }
  return code
}

/**
 * The canonical form of a code as it arrived — lowercased, THEN shape-checked
 * (§2.4: some clients capitalise a pasted link) — or `null` when it is not a
 * code at all. The route calls this BEFORE it touches Sanity.
 */
export function normalizeShortCode(
  raw: string | null | undefined,
): string | null {
  if (typeof raw !== 'string') return null
  const lowered = raw.toLowerCase()
  return SHORT_CODE_SHAPE.test(lowered) ? lowered : null
}

/**
 * A batch mint for one conference. `existing` is every code the conference
 * already holds (read in ONE query); values that are not codes are ignored, so
 * a caller can hand over a raw projection without filtering it first.
 *
 * The returned function is stateful on purpose: it remembers what it handed
 * out, so a batch cannot collide with itself.
 */
export function createShortCodeMinter(
  existing: Iterable<string | null | undefined>,
  random: () => number = secureRandom,
): () => string {
  const taken = new Set<string>()
  for (const value of existing) {
    const code = normalizeShortCode(value)
    if (code) taken.add(code)
  }
  return () => {
    for (let attempt = 0; attempt < MAX_DRAWS; attempt++) {
      const code = drawShortCode(random)
      if (!taken.has(code)) {
        taken.add(code)
        return code
      }
    }
    throw new Error(
      `Could not mint a free short code in ${MAX_DRAWS} draws; refusing to reuse one`,
    )
  }
}

/**
 * A DETERMINISTIC code source — `aaaaaa`, `aaaaab`, … — for tests, stories and
 * migrations, mirroring the `newId` callbacks those callers already inject.
 * Never for a mutation: it checks nothing against the conference and its codes
 * are guessable. Use {@link createShortCodeMinter} there.
 */
export function sequentialShortCodes(): () => string {
  let n = 0
  return () => {
    let rest = n++
    let code = ''
    for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
      code =
        SHORT_CODE_ALPHABET.charAt(rest % SHORT_CODE_ALPHABET.length) + code
      rest = Math.floor(rest / SHORT_CODE_ALPHABET.length)
    }
    return code
  }
}
