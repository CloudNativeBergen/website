import { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: false, // disabled due to https://github.com/vercel/next.js/issues/35822
  publicRuntimeConfig: {},
  experimental: {
    // Add these experimental flags to resolve JSDOM conflicts with Turbopack
    optimizePackageImports: ['isomorphic-dompurify'],
  },
  serverExternalPackages: ['jsdom'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
      },
      {
        protocol: 'https',
        hostname: 'cdn.sanity.io',
      },
      {
        protocol: 'https',
        hostname: 'media.licdn.com',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Credentials',
            value: 'true',
          },
          {
            key: 'Access-Control-Allow-Origin',
            value: process.env.NEXT_PUBLIC_APP_URL || '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET,DELETE,PATCH,POST,PUT,OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value:
              'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
          },
        ],
      },
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy-Report-Only',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://api.pirsch.io https://vercel.live",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://api.workos.com https://*.sanity.io https://vercel.live wss://vercel.live https://vitals.vercel-insights.com https://api.pirsch.io",
              "frame-src 'self' https://challenges.cloudflare.com",
              "worker-src 'self' blob:",
            ].join('; '),
          },
        ],
      },
    ]
  },
  async redirects() {
    return [
      {
        source: '/agenda',
        destination: '/program',
        permanent: true,
      },
    ]
  },
}

export default config
