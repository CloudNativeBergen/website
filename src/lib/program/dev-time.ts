let simulatedTime: Date | null = null
const listeners = new Set<() => void>()

export function setSimulatedTime(time: Date | string | null): void {
  if (process.env.NODE_ENV !== 'development') return

  simulatedTime =
    time === null ? null : typeof time === 'string' ? new Date(time) : time
  listeners.forEach((listener) => listener())
}

export function onSimulatedTimeChange(listener: () => void): () => void {
  if (process.env.NODE_ENV !== 'development') return () => {}
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSimulatedTime(): Date | null {
  return process.env.NODE_ENV === 'development' ? simulatedTime : null
}

export function isSimulatedTimeActive(): boolean {
  return process.env.NODE_ENV === 'development' && simulatedTime !== null
}

export function clearSimulatedTime(): void {
  setSimulatedTime(null)
}

// Make available in browser console for easy testing
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  interface DevTimeAPI {
    set: typeof setSimulatedTime
    clear: typeof clearSimulatedTime
    get: typeof getSimulatedTime
    isActive: typeof isSimulatedTimeActive
  }

  ;(window as unknown as { devTime: DevTimeAPI }).devTime = {
    set: setSimulatedTime,
    clear: clearSimulatedTime,
    get: getSimulatedTime,
    isActive: isSimulatedTimeActive,
  }
}
