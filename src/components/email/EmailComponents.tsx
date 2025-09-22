import * as React from 'react'

interface EmailSectionProps {
  backgroundColor?: string
  background?: string
  borderColor: string
  borderLeftColor?: string
  children: React.ReactNode
}

export function EmailSection({
  backgroundColor,
  background,
  borderColor,
  borderLeftColor,
  children,
}: EmailSectionProps) {
  const sectionStyle: React.CSSProperties = {
    ...(backgroundColor && { backgroundColor }),
    ...(background && { background }),
    padding: '20px',
    borderRadius: '12px',
    marginBottom: '24px',
    border: `1px solid ${borderColor}`,
    ...(borderLeftColor && { borderLeft: `4px solid ${borderLeftColor}` }),
  }

  return <div style={sectionStyle}>{children}</div>
}

interface EmailSectionHeaderProps {
  children: React.ReactNode
  color?: string
}

export function EmailSectionHeader({
  children,
  color = '#1D4ED8',
}: EmailSectionHeaderProps) {
  const headerStyle: React.CSSProperties = {
    color,
    marginTop: '0',
    marginBottom: '12px',
    fontFamily:
      '"Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '16px',
    fontWeight: '600',
  }

  return <h4 style={headerStyle}>{children}</h4>
}

interface EmailTextProps {
  children: React.ReactNode
  color?: string
  italic?: boolean
  size?: string
  weight?: string
}

export function EmailText({
  children,
  color = '#334155',
  italic = false,
  size = '15px',
  weight = '400',
}: EmailTextProps) {
  const textStyle: React.CSSProperties = {
    margin: '0',
    color,
    fontSize: size,
    lineHeight: '1.6',
    fontWeight: weight,
    ...(italic && { fontStyle: 'italic' }),
  }

  return <p style={textStyle}>{children}</p>
}

interface EmailButtonProps {
  href: string
  children: React.ReactNode
  variant?: 'primary' | 'secondary'
}

export function EmailButton({
  href,
  children,
  variant = 'primary',
}: EmailButtonProps) {
  const buttonStyle: React.CSSProperties = {
    backgroundColor: variant === 'primary' ? '#1D4ED8' : '#6366F1',
    color: 'white',
    padding: '16px 32px',
    textDecoration: 'none',
    borderRadius: '16px',
    fontWeight: '600',
    fontSize: '16px',
    fontFamily:
      '"Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    display: 'inline-block',
    textAlign: 'center' as const,

    transition: 'background-color 0.2s ease',
    border: 'none',
    boxShadow: '0 4px 12px rgba(29, 78, 216, 0.25)',
    lineHeight: '1.2',
  }

  const centerStyle: React.CSSProperties = {
    textAlign: 'center' as const,
    marginBottom: '32px',
  }

  return (
    <div style={centerStyle}>
      <a href={href} style={buttonStyle}>
        {children}
      </a>
    </div>
  )
}
