import * as React from 'react'
import { emailButtonShadow } from '@/lib/branding/email'
import { emailBrand } from './EmailBrandScope'

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
  /** Overrides the inherited brand accent. Omit it — that is the point. */
  color?: string
}

export function EmailSectionHeader({
  children,
  color,
}: EmailSectionHeaderProps) {
  // Inherited from the enclosing BaseEmailTemplate; house blue outside one.
  const brand = emailBrand()
  const headerStyle: React.CSSProperties = {
    color: color ?? brand.accent,
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
  /**
   * Overrides the primary fill. Defaults to the brand accent inherited from the
   * enclosing `BaseEmailTemplate` — no call site should need this.
   */
  color?: string
}

export function EmailButton({
  href,
  children,
  variant = 'primary',
  color,
}: EmailButtonProps) {
  const brand = emailBrand()
  // `brand.accent` is already clamped for contrast against white text (see
  // `resolveEmailBrandPalette`); an explicit `color` is taken at face value —
  // that override is the caller asserting it knows better.
  const fill = color ?? brand.accent
  // KNOWN RESIDUAL, deliberately unfixed: `secondary` keeps a fixed indigo fill
  // (one call site, `GallerySpeakerTaggedTemplate`) while the shadow below
  // follows the brand, so a themed secondary button is indigo under a tenant
  // shadow. The mismatch is INHERITED, not introduced — before theming the
  // shadow was the house blue under BOTH variants, so an unthemed secondary has
  // always been indigo-over-blue. Both obvious repairs (derive the shadow from
  // the actual fill; pin a matching indigo shadow) change unthemed bytes and
  // fail the byte-identity snapshots. Whether `secondary` is brand or neutral
  // chrome is a product decision; until it is taken, neither is a safe edit.
  const buttonStyle: React.CSSProperties = {
    backgroundColor: variant === 'primary' ? fill : '#6366F1',
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
    boxShadow: `0 4px 12px ${color ? emailButtonShadow(color) : brand.buttonShadow}`,
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
