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

function getAvatarColor(name: string): string {
  const firstLetter = name.charAt(0).toUpperCase()
  const charCode = firstLetter.charCodeAt(0)
  const colorIndex = charCode % avatarColors.length
  return avatarColors[colorIndex]
}

function getAvatarLetter(name: string): string {
  const nameParts = name.trim().split(/\s+/)

  if (nameParts.length >= 2) {
    return (
      nameParts[0].charAt(0).toUpperCase() +
      nameParts[nameParts.length - 1].charAt(0).toUpperCase()
    )
  } else {
    const singleName = nameParts[0]
    return singleName.length >= 2
      ? singleName.charAt(0).toUpperCase() + singleName.charAt(1).toUpperCase()
      : singleName.charAt(0).toUpperCase()
  }
}

interface MissingAvatarProps {
  name: string

  size: number

  className?: string

  textSizeClass?: string
}

export function MissingAvatar({
  name,
  size,
  className = '',
  textSizeClass,
}: MissingAvatarProps) {
  const bgColor = getAvatarColor(name)
  const initials = getAvatarLetter(name)

  const autoTextSize =
    size >= 100
      ? 'text-xl'
      : size >= 60
        ? 'text-base'
        : size >= 40
          ? 'text-sm'
          : 'text-xs'
  const finalTextSize = textSizeClass || autoTextSize

  const usesAbsoluteFill =
    className.includes('absolute') && className.includes('inset-0')

  return (
    <div
      className={`flex h-full w-full items-center justify-center ${bgColor} ${className}`}
      style={usesAbsoluteFill ? undefined : { width: size, height: size }}
    >
      <span className={`${finalTextSize} leading-none font-bold text-white`}>
        {initials}
      </span>
    </div>
  )
}
