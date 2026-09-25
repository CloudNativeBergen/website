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
}

export function startHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], group: null, at: 0 }
}

export function record<T>(
  history: History<T>,
  next: T,
  { group, now }: { group?: string; now: number },
): History<T> {
  if (Object.is(next, history.present)) return history
  const folds =
    group !== undefined &&
    group === history.group &&
    now - history.at < COALESCE_MS
  return {
    past: folds
      ? history.past
      : [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
    group: group ?? null,
    at: now,
  }
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
export const allStates = <T,>(history: History<T>): T[] => [
  ...history.past,
  history.present,
  ...history.future,
]
