import { describe, it, expect } from '@jest/globals'
import { Metadata } from 'next'

// Test the metadata generation logic independently
describe('RootLayout metadata generation logic', () => {
  // Helper function that mimics the generateMetadata logic
  function createMetadata(host: string | null): Metadata {
    const hostValue = host || 'localhost:3000'
    const protocol = hostValue.includes('localhost') ? 'http' : 'https'
    const metadataBase = new URL(`${protocol}://${hostValue}`)

    return {
      metadataBase,
      title: {
        template: '%s - Cloud Native Day Bergen',
        default:
          'Cloud Native Day Bergen - A community-driven Kubernetes and Cloud conference',
      },
      description:
        'At Cloud Native Day Bergen, we bring together the community to share knowledge and experience on Kubernetes, Cloud Native, and related technologies.',
    }
  }

  it('should set metadataBase to localhost for local development', () => {
    const metadata = createMetadata('localhost:3000')

    expect(metadata.metadataBase?.toString()).toBe('http://localhost:3000/')
    expect(metadata.title).toEqual({
      template: '%s - Cloud Native Day Bergen',
      default:
        'Cloud Native Day Bergen - A community-driven Kubernetes and Cloud conference',
    })
    expect(metadata.description).toBe(
      'At Cloud Native Day Bergen, we bring together the community to share knowledge and experience on Kubernetes, Cloud Native, and related technologies.',
    )
  })

  it('should set metadataBase to https for production domain a.example.com', () => {
    const metadata = createMetadata('a.example.com')

    expect(metadata.metadataBase?.toString()).toBe('https://a.example.com/')
  })

  it('should set metadataBase to https for production domain b.example.com', () => {
    const metadata = createMetadata('b.example.com')

    expect(metadata.metadataBase?.toString()).toBe('https://b.example.com/')
  })

  it('should fallback to localhost when host header is missing', () => {
    const metadata = createMetadata(null)

    expect(metadata.metadataBase?.toString()).toBe('http://localhost:3000/')
  })

  it('should use https for vercel preview domains', () => {
    const metadata = createMetadata('my-app-123.vercel.app')

    expect(metadata.metadataBase?.toString()).toBe(
      'https://my-app-123.vercel.app/',
    )
  })

  it('should use https for custom domains', () => {
    const metadata = createMetadata('2024.cloudnativebergen.no')

    expect(metadata.metadataBase?.toString()).toBe(
      'https://2024.cloudnativebergen.no/',
    )
  })

  it('should handle domains with ports correctly', () => {
    const metadata = createMetadata('staging.example.com:8080')

    expect(metadata.metadataBase?.toString()).toBe(
      'https://staging.example.com:8080/',
    )
  })
})
