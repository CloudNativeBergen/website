/**
 * Tests for the shared domain-routing predicates (SE-1b). Pins the ONE rule
 * both the routing GROQ and every claim/strand guard must agree on: an entry
 * serves a host exactly, or via its single-label wildcard form — and the
 * claim-uniqueness predicate `domainEntriesOverlap` applies that rule in BOTH
 * directions so no two tenants can ever route the same host.
 */
import { describe, it, expect } from 'vitest'
import {
  domainServesHost,
  domainEntriesOverlap,
  wildcardFormForHost,
} from './domains'

describe('wildcardFormForHost', () => {
  it('wildcards the first label of a 3+-label host', () => {
    expect(wildcardFormForHost('foo.example.com')).toBe('*.example.com')
    expect(wildcardFormForHost('a.b.example.com')).toBe('*.b.example.com')
  })

  it('returns null for hosts with nothing to wildcard', () => {
    expect(wildcardFormForHost('example.com')).toBeNull()
    expect(wildcardFormForHost('localhost:3000')).toBeNull()
  })
})

describe('domainServesHost', () => {
  it('matches exactly and via the single-label wildcard', () => {
    expect(domainServesHost('example.com', 'example.com')).toBe(true)
    expect(domainServesHost('*.example.com', 'foo.example.com')).toBe(true)
    expect(domainServesHost('*.example.com', 'bar.example.com')).toBe(true)
  })

  it('does NOT match deeper subdomains or the apex through a wildcard', () => {
    expect(domainServesHost('*.example.com', 'a.b.example.com')).toBe(false)
    expect(domainServesHost('*.example.com', 'example.com')).toBe(false)
    expect(domainServesHost('other.com', 'example.com')).toBe(false)
  })
})

describe('domainEntriesOverlap — the claim-uniqueness predicate', () => {
  it('overlaps on equality (exact and wildcard entries alike)', () => {
    expect(domainEntriesOverlap('example.com', 'example.com')).toBe(true)
    expect(domainEntriesOverlap('*.example.com', '*.example.com')).toBe(true)
  })

  it('an existing wildcard overlaps a new host under it (direction 1)', () => {
    expect(domainEntriesOverlap('*.example.com', 'sub.example.com')).toBe(true)
  })

  it('a new wildcard overlaps an existing host it would capture (direction 2)', () => {
    expect(domainEntriesOverlap('sub.example.com', '*.example.com')).toBe(true)
  })

  it('distinct wildcards and unrelated hosts do not overlap', () => {
    expect(domainEntriesOverlap('*.example.com', '*.example.org')).toBe(false)
    // Single-label semantics: *.example.com never serves a.b.example.com.
    expect(domainEntriesOverlap('*.example.com', '*.b.example.com')).toBe(false)
    expect(domainEntriesOverlap('a.example.com', 'b.example.com')).toBe(false)
    // The apex is NOT covered by its wildcard (≤2 labels have no wildcard form).
    expect(domainEntriesOverlap('*.example.com', 'example.com')).toBe(false)
  })

  it('is normalization-tolerant like the routing matcher', () => {
    expect(domainEntriesOverlap('*.Example.com ', 'sub.example.COM')).toBe(true)
  })
})
