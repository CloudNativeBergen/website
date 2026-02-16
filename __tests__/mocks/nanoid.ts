let counter = 0

export function nanoid(size?: number): string {
  const id = `test-nanoid-${counter++}`
  if (size) {
    return id.slice(0, size)
  }
  return id
}

export default { nanoid }
