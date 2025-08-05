// Color palette for letter-based avatars
const avatarColors = [
  'bg-red-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-yellow-500',
  'bg-lime-500',
  'bg-green-500',
  'bg-emerald-500',
  'bg-teal-500',
  'bg-cyan-500',
  'bg-sky-500',
  'bg-blue-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-purple-500',
  'bg-fuchsia-500',
  'bg-pink-500',
  'bg-rose-500',
]

// Generate consistent color based on first letter
function getAvatarColor(name: string): string {
  const firstLetter = name.charAt(0).toUpperCase()
  const charCode = firstLetter.charCodeAt(0)
  const colorIndex = charCode % avatarColors.length
  return avatarColors[colorIndex]
}

// Get first letter(s) for avatar
function getAvatarLetter(name: string): string {
  const nameParts = name.trim().split(/\s+/)

  if (nameParts.length >= 2) {
    // First letter of first name + first letter of last name
    return (
      nameParts[0].charAt(0).toUpperCase() +
      nameParts[nameParts.length - 1].charAt(0).toUpperCase()
    )
  } else {
    // If only one name part, use first two letters or just one if name is short
    const singleName = nameParts[0]
    return singleName.length >= 2
      ? singleName.charAt(0).toUpperCase() + singleName.charAt(1).toUpperCase()
      : singleName.charAt(0).toUpperCase()
  }
}

interface MissingAvatarProps {
  /** The name to generate initials from */
  name: string
  /** Size of the avatar in pixels */
  size: number
  /** Additional CSS classes */
  className?: string
  /** Text size class override */
  textSizeClass?: string
}

/**
 * Reusable component for displaying letter-based avatars when no image is available.
 * Uses consistent color generation based on the name to ensure the same person
 * always gets the same colored avatar.
 */
export function MissingAvatar({
  name,
  size,
  className = '',
  textSizeClass,
}: MissingAvatarProps) {
  const bgColor = getAvatarColor(name)
  const initials = getAvatarLetter(name)

  // Auto-calculate text size based on avatar size if not provided
  const autoTextSize =
    size >= 100
      ? 'text-xl'
      : size >= 60
        ? 'text-base'
        : size >= 40
          ? 'text-sm'
          : 'text-xs'
  const finalTextSize = textSizeClass || autoTextSize

  return (
    <div
      className={`flex items-center justify-center ${bgColor} ${className}`}
      style={{ width: size, height: size }}
    >
      <span className={`${finalTextSize} font-bold text-white`}>
        {initials}
      </span>
    </div>
  )
}
