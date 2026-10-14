/**
 * @vitest-environment node
 *
 * WHICH REQUEST HOSTS ARE A DEVELOPER'S OWN MACHINE (#1347, review).
 *
 * Every sponsor send that must not leave a development server asks
 * `isLocalhostDomain` (registration, contract, workshop early access), and so
 * does the composer's Send button. A host it misses is a host from which a
 * dev server mails real contacts.
 *
 * A request host resolves to a conference when it is an entry of that
 * conference's `domains[]`, and a host with a port needs no DNS proof to be
 * served. `0.0.0.0:3000` and `tenant.localhost:3000` pass the admin editor's
 * own check (`isValidDomainEntry`); `[::1]:3000` does not, but Sanity Studio
 * validates only that the list is non-empty and unique. So each of these can
 * be a host a conference is served on.
 */
import { describe, expect, it } from 'vitest'
import { isLocalhostDomain, protocolForDomain } from './localhost'

describe('isLocalhostDomain', () => {
  it.each([
    'localhost',
    'localhost:3000',
    'LOCALHOST:3000',
    '127.0.0.1',
    '127.0.0.1:3000',
    // The whole 127/8 block is loopback.
    '127.1.2.3:3000',
    // IPv6 loopback: the address has colons of its own, so the port cannot
    // be cut at the first one.
    '[::1]',
    '[::1]:3000',
    '::1',
    // The address a dev server listening on every interface is opened at.
    '0.0.0.0',
    '0.0.0.0:3000',
    // RFC 6761: every name under `.localhost` is loopback.
    'tenant.localhost',
    'tenant.localhost:3000',
  ])('is true for %s', (host) => {
    expect(isLocalhostDomain(host)).toBe(true)
  })

  it.each([
    '',
    'cloudnativedays.no',
    '2026.cloudnativedays.no:443',
    // A public name that merely contains the word, or starts with the digits.
    'localhost.example.com',
    'notlocalhost:3000',
    'mylocalhost',
    '127.0.0.1.example.com',
    '1270.0.0.1',
    // A private or public address is not this machine.
    '10.0.0.1:3000',
    '192.168.1.10:3000',
    '[2001:db8::1]:3000',
    '[::11]:3000',
  ])('is false for %s', (host) => {
    expect(isLocalhostDomain(host)).toBe(false)
  })
})

describe('protocolForDomain', () => {
  it.each([
    ['localhost:3000', 'http'],
    ['[::1]:3000', 'http'],
    ['0.0.0.0:3000', 'http'],
    ['cloudnativedays.no', 'https'],
  ])('%s is served over %s', (host, protocol) => {
    expect(protocolForDomain(host)).toBe(protocol)
  })
})
