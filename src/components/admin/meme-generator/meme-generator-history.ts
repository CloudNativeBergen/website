/**
 * Undo and redo, as a value. Every change to the video — its scenes, their
 * lengths and order, every field of every design — goes through `record`, and
 * the editor shows `present`.
 *
 * A continuous change is one step: a change that names the same `group` as
 * the one before it, within a second of it, folds into that step instead of
 * making a new one. A drag, a slider or a burst of typing is then one undo,
 * and a pause of a second starts the next. Anything that names no group — add,
 * delete, reorder — is always a step of its own.
 */

/** How long a group stays open after its last change. */
export const COALESCE_MS = 1000
/** Steps kept; older ones are dropped, with whatever images only they held. */
export const HISTORY_LIMIT = 100

export interface History<T> {
  past: T[]
  present: T
  future: T[]
  /** The group the latest step belongs to, while it can still fold. */
  group: string | null
  at: number
  /**
   * The oldest step, dropped for the limit when the open step was made —
   * put back if that step is taken back by a burst that ends where it began.
   */
  evicted?: T[]
}

export function startHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], group: null, at: 0 }
}

export function record<T>(
  history: History<T>,
  next: T,
  { group, now }: { group?: string; now: number },
): History<T> {
  // A change that changes nothing — a swatch picked twice, a length clamped
  // back to what it was — is no step, and leaves redo alone.
  if (sameValue(next, history.present)) return history
  const folds =
    group !== undefined &&
    group === history.group &&
    now - history.at < COALESCE_MS
  // A burst that ends where it began — a character typed and deleted, a
  // slider dragged back — leaves no step that undoes nothing.
  const before = history.past[history.past.length - 1]
  if (folds && history.past.length > 0 && sameValue(next, before)) {
    return {
      past: [...(history.evicted ?? []), ...history.past.slice(0, -1)],
      present: before,
      future: [],
      group: null,
      at: now,
    }
  }
  if (folds) return { ...history, present: next, future: [], at: now }
  const pushed = [...history.past, history.present]
  const cut = Math.max(pushed.length - HISTORY_LIMIT, 0)
  return {
    past: pushed.slice(cut),
    present: next,
    future: [],
    group: group ?? null,
    at: now,
    evicted: pushed.slice(0, cut),
  }
}

/** Deep equality of plain data: the scenes are objects, arrays and primitives. */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  return keysA.every(
    (key) =>
      Object.hasOwn(b, key) &&
      sameValue(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      ),
  )
}

export const canUndo = (history: History<unknown>) => history.past.length > 0
export const canRedo = (history: History<unknown>) => history.future.length > 0

export function undo<T>(history: History<T>): History<T> {
  if (!canUndo(history)) return history
  return {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1],
    future: [history.present, ...history.future],
    group: null,
    at: history.at,
  }
}

export function redo<T>(history: History<T>): History<T> {
  if (!canRedo(history)) return history
  return {
    past: [...history.past, history.present],
    present: history.future[0],
    future: history.future.slice(1),
    group: null,
    at: history.at,
  }
}

/** Every state the history can return to, the present included. */
export const allStates = <T>(history: History<T>): T[] => [
  ...history.past,
  history.present,
  ...history.future,
]
