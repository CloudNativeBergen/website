import Link from 'next/link'
import clsx from 'clsx'

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'info'
  | 'outline'
type ButtonSize = 'sm' | 'md' | 'lg'

interface BaseButtonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  children: React.ReactNode
}

type LinkButtonProps = BaseButtonProps & {
  href: string
} & Omit<
    React.ComponentPropsWithoutRef<typeof Link>,
    'href' | 'className' | 'children'
  >

type ButtonElementProps = BaseButtonProps & {
  href?: never
} & Omit<React.ComponentPropsWithoutRef<'button'>, 'className' | 'children'>

type ButtonProps = LinkButtonProps | ButtonElementProps

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-cloud-blue hover:bg-brand-cloud-blue-hover text-white dark:bg-brand-cloud-blue dark:hover:bg-brand-cloud-blue-hover focus-visible:outline-brand-cloud-blue',
  secondary:
    'bg-brand-nordic-purple hover:bg-brand-nordic-purple-hover text-white dark:bg-brand-nordic-purple dark:hover:bg-brand-nordic-purple-hover focus-visible:outline-brand-nordic-purple',
  success:
    'bg-brand-fresh-green hover:bg-brand-fresh-green-hover text-white dark:bg-brand-fresh-green dark:hover:bg-brand-fresh-green-hover focus-visible:outline-brand-fresh-green',
  warning:
    'bg-brand-sunbeam-yellow hover:bg-brand-sunbeam-yellow-hover text-black dark:bg-brand-sunbeam-yellow dark:hover:bg-brand-sunbeam-yellow-hover dark:text-gray-900 focus-visible:outline-brand-sunbeam-yellow',
  info: 'bg-brand-slate-gray hover:bg-brand-slate-gray-hover text-white dark:bg-brand-slate-gray dark:hover:bg-brand-slate-gray-hover focus-visible:outline-brand-slate-gray',
  outline:
    'bg-transparent text-brand-cloud-blue hover:bg-brand-cloud-blue hover:text-white dark:text-brand-cloud-blue dark:hover:bg-brand-cloud-blue dark:hover:text-white focus-visible:outline-brand-cloud-blue shadow-[inset_0_0_0_2px_var(--color-brand-cloud-blue)] hover:shadow-[inset_0_0_0_2px_var(--color-brand-cloud-blue)]',
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-2 text-sm',
  md: 'px-4 py-3 text-base',
  lg: 'px-6 py-4 text-lg',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: ButtonProps) {
  const baseStyles =
    'inline-flex items-center justify-center rounded-2xl font-semibold transition-colors duration-200 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed'

  const buttonClassName = clsx(
    baseStyles,
    variantStyles[variant],
    sizeStyles[size],
    className,
  )

  if ('href' in props && props.href) {
    const { href, ...linkProps } = props
    return (
      <Link href={href} className={buttonClassName} {...linkProps}>
        {children}
      </Link>
    )
  }

  return (
    <button className={buttonClassName} {...(props as ButtonElementProps)}>
      {children}
    </button>
  )
}
