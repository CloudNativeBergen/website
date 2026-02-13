import clsx from 'clsx'

interface ContentCardProps {
  children: React.ReactNode
  className?: string
}

export function ContentCard({ children, className }: ContentCardProps) {
  return (
    <div
      className={clsx(
        'mx-auto mt-16 max-w-4xl rounded-xl border border-brand-frosted-steel bg-white p-8 shadow-sm',
        'dark:border-gray-700 dark:bg-gray-800 dark:shadow-gray-900/20',
        'print:mt-8 print:max-w-none print:rounded-none print:border-0 print:bg-white print:p-0 print:shadow-none',
        className,
      )}
    >
      {children}
    </div>
  )
}
