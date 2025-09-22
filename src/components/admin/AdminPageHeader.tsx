import React from 'react'

export interface StatCardProps {
  value: string | number

  label: string

  color?: 'blue' | 'green' | 'purple' | 'slate' | 'indigo'

  icon?: React.ReactNode
}

export interface AdminPageHeaderProps {
  icon: React.ReactNode

  title: string

  description: string | React.ReactNode

  contextHighlight?: string

  stats: StatCardProps[]

  actions?: React.ReactNode

  children?: React.ReactNode
}

function getValueColorClasses(color: StatCardProps['color'] = 'slate') {
  switch (color) {
    case 'blue':
      return 'text-brand-cloud-blue dark:text-blue-300'
    case 'green':
      return 'text-brand-fresh-green dark:text-green-300'
    case 'purple':
      return 'text-brand-nordic-purple dark:text-indigo-300'
    case 'indigo':
      return 'text-brand-cloud-blue dark:text-indigo-300'
    case 'slate':
    default:
      return 'text-brand-slate-gray dark:text-white'
  }
}

function StatCard({ value, label, color = 'slate', icon }: StatCardProps) {
  const valueColorClasses = getValueColorClasses(color)

  return (
    <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-brand-frosted-steel/20 dark:bg-gray-900 dark:ring-gray-700">
      <div className="flex items-center gap-2">
        {icon && <div className="flex-shrink-0">{icon}</div>}
        <div className={`text-lg font-bold sm:text-xl ${valueColorClasses}`}>
          {value}
        </div>
      </div>
      <div className="mt-1 text-xs text-brand-slate-gray/70 dark:text-gray-400">
        {label}
      </div>
    </div>
  )
}

export function AdminPageHeader({
  icon,
  title,
  description,
  contextHighlight,
  stats,
  actions,
  children,
}: AdminPageHeaderProps) {
  const getGridCols = (statCount: number) => {
    if (statCount <= 1) return 'grid-cols-2'
    if (statCount <= 2) return 'grid-cols-2 sm:grid-cols-3'
    if (statCount <= 3) return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
    if (statCount <= 4) return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
    if (statCount <= 6)
      return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6'

    return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'
  }

  return (
    <div className="pb-6">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-1 flex-shrink-0">
            <div className="h-6 w-6 text-brand-cloud-blue sm:h-8 sm:w-8 dark:text-blue-300">
              {icon}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="font-space-grotesk text-xl leading-6 font-bold text-brand-slate-gray sm:text-2xl sm:leading-7 sm:tracking-tight lg:text-3xl lg:leading-8 dark:text-white">
              {title}
            </h1>
            <div className="font-inter mt-2 text-sm text-brand-slate-gray/70 dark:text-gray-400">
              {typeof description === 'string' ? (
                <p>
                  {description}
                  {contextHighlight && (
                    <>
                      {' '}
                      <span className="font-medium text-brand-cloud-blue dark:text-blue-300">
                        {contextHighlight}
                      </span>
                    </>
                  )}
                </p>
              ) : (
                description
              )}
            </div>
          </div>
        </div>

        {actions && (
          <div className="ml-4 flex-shrink-0">
            <div className="flex flex-col gap-2 sm:flex-row">{actions}</div>
          </div>
        )}
      </div>

      {stats.length > 0 && (
        <div
          className={`font-inter mt-4 grid sm:mt-6 ${getGridCols(stats.length)} gap-3`}
        >
          {stats.map((stat, index) => (
            <StatCard
              key={`${stat.label}-${index}`}
              value={stat.value}
              label={stat.label}
              color={stat.color}
              icon={stat.icon}
            />
          ))}
        </div>
      )}

      {children}
    </div>
  )
}

export default AdminPageHeader
