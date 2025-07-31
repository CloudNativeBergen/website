interface InvitationErrorCardProps {
  type:
    | 'invalid-link'
    | 'not-found'
    | 'expired'
    | 'already-processed'
    | 'general'
  title: string
  message: string
  actionButton?: {
    href: string
    text: string
    variant?: 'primary' | 'secondary'
  }
}

export function InvitationErrorCard({
  type,
  title,
  message,
  actionButton,
}: InvitationErrorCardProps) {
  const getColorClasses = () => {
    switch (type) {
      case 'invalid-link':
      case 'not-found':
      case 'general':
        return {
          border: 'border-red-200',
          bg: 'bg-red-50',
          titleColor: 'text-red-800',
          messageColor: 'text-red-600',
          buttonBg: 'bg-red-600',
          buttonHover: 'hover:bg-red-700',
        }
      case 'expired':
        return {
          border: 'border-amber-200',
          bg: 'bg-amber-50',
          titleColor: 'text-amber-800',
          messageColor: 'text-amber-600',
          buttonBg: 'bg-amber-600',
          buttonHover: 'hover:bg-amber-700',
        }
      case 'already-processed':
        return {
          border: 'border-blue-200',
          bg: 'bg-blue-50',
          titleColor: 'text-blue-800',
          messageColor: 'text-blue-600',
          buttonBg: 'bg-blue-600',
          buttonHover: 'hover:bg-blue-700',
        }
      default:
        return {
          border: 'border-gray-200',
          bg: 'bg-gray-50',
          titleColor: 'text-gray-800',
          messageColor: 'text-gray-600',
          buttonBg: 'bg-gray-600',
          buttonHover: 'hover:bg-gray-700',
        }
    }
  }

  const colors = getColorClasses()

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-6">
        <div
          className={`rounded-lg border ${colors.border} ${colors.bg} p-4`}
          role="alert"
          aria-live="polite"
        >
          <h2 className={`mb-2 text-lg font-semibold ${colors.titleColor}`}>
            {title}
          </h2>
          <p className={colors.messageColor}>{message}</p>
          {actionButton && (
            <a
              href={actionButton.href}
              className={`mt-4 inline-block rounded px-4 py-2 text-white ${
                actionButton.variant === 'secondary'
                  ? 'bg-gray-600 hover:bg-gray-700'
                  : `${colors.buttonBg} ${colors.buttonHover}`
              } transition-colors focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none`}
            >
              {actionButton.text}
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
