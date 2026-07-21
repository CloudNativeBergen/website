import clsx from 'clsx'

type AdminButtonVariant = 'primary' | 'secondary' | 'ghost'
type AdminButtonColor =
  'indigo' | 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'yellow'
type AdminButtonSize = 'xs' | 'sm' | 'md'

interface AdminButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: AdminButtonVariant
  color?: AdminButtonColor
  size?: AdminButtonSize
}

const colorStyles: Record<AdminButtonColor, string> = {
  indigo:
    'bg-indigo-600 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline-indigo-600',
  blue: 'bg-blue-600 text-white shadow-sm hover:bg-blue-700 focus-visible:outline-blue-600',
  green:
    'bg-green-600 text-white shadow-sm hover:bg-green-700 focus-visible:outline-green-600',
  orange:
    'bg-orange-600 text-white shadow-sm hover:bg-orange-700 focus-visible:outline-orange-600',
  red: 'bg-red-600 text-white shadow-sm hover:bg-red-700 focus-visible:outline-red-600',
  purple:
    'bg-purple-600 text-white shadow-sm hover:bg-purple-700 focus-visible:outline-purple-600',
  yellow:
    'bg-yellow-600 text-white shadow-sm hover:bg-yellow-700 focus-visible:outline-yellow-600',
}

const variantStyles: Record<Exclude<AdminButtonVariant, 'primary'>, string> = {
  // Dark-mode classes matter: `secondary`/`ghost` are the default footer buttons
  // of admin modals that render on a dark surface (AnnounceModal,
  // EditConferenceCard, …). Without them the light `bg-white`/`text-gray-700`
  // pair sat on a dark panel as an illegible white-on-light chip.
  secondary:
    'bg-white text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-white/10 dark:text-gray-100 dark:ring-white/15 dark:hover:bg-white/20',
  ghost:
    'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/10',
}

const sizeStyles: Record<AdminButtonSize, string> = {
  xs: 'px-2 py-1 text-xs',
  sm: 'px-3 py-2 text-sm',
  md: 'px-4 py-2 text-sm',
}

export function AdminButton({
  variant = 'primary',
  color = 'indigo',
  size = 'sm',
  // Default to type="button" (native buttons default to type="submit").
  // Without this, any AdminButton inside a <form> — e.g. a modal's Cancel or
  // Reset button — implicitly submits the form on click. Buttons that are
  // meant to submit must pass type="submit" explicitly.
  type = 'button',
  className,
  ...props
}: AdminButtonProps) {
  return (
    <button
      type={type}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' ? colorStyles[color] : variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...props}
    />
  )
}
