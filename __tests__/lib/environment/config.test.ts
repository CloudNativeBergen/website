describe('AppEnvironment', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    delete (global as any).window
  })

  afterAll(() => {
    Object.keys(process.env).forEach((key) => {
      delete process.env[key]
    })
    Object.assign(process.env, originalEnv)
  })

  const mockEnvironment = (env: Record<string, string | undefined>) => {
    Object.keys(env).forEach((key) => {
      if (env[key] === undefined) {
        delete process.env[key]
      } else {
        ;(process.env as any)[key] = env[key]
      }
    })
  }

  const importFresh = async () => {
    const mod = await import('@/lib/environment/config')
    return mod.AppEnvironment
  }

  describe('Environment Detection', () => {
    it('should detect development environment correctly', async () => {
      mockEnvironment({ NODE_ENV: 'development' })
      const AppEnvironment = await importFresh()
      expect(AppEnvironment.isDevelopment).toBe(true)
    })

    it('should detect production environment correctly', async () => {
      mockEnvironment({ NODE_ENV: 'production' })
      const AppEnvironment = await importFresh()
      expect(AppEnvironment.isDevelopment).toBe(false)
    })

    it('should enable test mode only in development with flag', async () => {
      mockEnvironment({
        NODE_ENV: 'development',
        NEXT_PUBLIC_ENABLE_TEST_MODE: 'true',
      })
      const AppEnvironment = await importFresh()
      expect(AppEnvironment.isTestMode).toBe(true)
    })

    it('should disable test mode in production even with flag', async () => {
      mockEnvironment({
        NODE_ENV: 'production',
        NEXT_PUBLIC_ENABLE_TEST_MODE: 'true',
      })
      const AppEnvironment = await importFresh()
      expect(AppEnvironment.isTestMode).toBe(false)
    })

    it('should disable test mode in development without flag', async () => {
      mockEnvironment({
        NODE_ENV: 'development',
        NEXT_PUBLIC_ENABLE_TEST_MODE: 'false',
      })
      const AppEnvironment = await importFresh()
      expect(AppEnvironment.isTestMode).toBe(false)
    })
  })

  describe('Test User Configuration', () => {
    it('should provide consistent test user data', async () => {
      const AppEnvironment = await importFresh()
      expect(AppEnvironment.testUser).toEqual({
        id: 'test-user-id',
        email: 'test@cloudnativedays.no',
        name: 'Test User',
        speakerId: 'test-speaker-id',
        picture: 'https://placehold.co/192x192/4f46e5/fff/png?text=TS',
      })
    })

    it('should have consistent test user data structure', async () => {
      const AppEnvironment = await importFresh()
      const testUser = AppEnvironment.testUser

      expect(testUser).toHaveProperty('id')
      expect(testUser).toHaveProperty('email')
      expect(testUser).toHaveProperty('name')
      expect(testUser).toHaveProperty('speakerId')
      expect(testUser).toHaveProperty('picture')

      expect(typeof testUser.id).toBe('string')
      expect(typeof testUser.email).toBe('string')
      expect(typeof testUser.name).toBe('string')
      expect(typeof testUser.speakerId).toBe('string')
      expect(typeof testUser.picture).toBe('string')
    })
  })

  describe('buildApiUrl', () => {
    beforeEach(() => {
      mockEnvironment({ NODE_ENV: 'test' })
      delete (global as any).window
    })

    it('should build URL with localhost in Node.js environment', async () => {
      const AppEnvironment = await importFresh()
      const url = AppEnvironment.buildApiUrl('/api/test')
      expect(url).toBe('http://localhost:3000/api/test')
    })

    it('should build URL with window.location.origin in browser environment', async () => {
      Object.defineProperty(global, 'window', {
        value: {
          location: {
            origin: 'https://example.com',
          },
        },
        writable: true,
        configurable: true,
      })

      const AppEnvironment = await importFresh()
      const url = AppEnvironment.buildApiUrl('/api/test')
      expect(url).toBe('https://example.com/api/test')

      delete (global as any).window
    })

    it('should add test parameter when test mode is enabled', async () => {
      mockEnvironment({
        NODE_ENV: 'development',
        NEXT_PUBLIC_ENABLE_TEST_MODE: 'true',
      })
      const AppEnvironment = await importFresh()
      const url = AppEnvironment.buildApiUrl('/api/test')
      expect(url).toBe('http://localhost:3000/api/test?test=true')
    })

    it('should add test parameter when explicitly requested', async () => {
      delete (global as any).window
      const AppEnvironment = await importFresh()
      const url = AppEnvironment.buildApiUrl('/api/test', { testMode: true })
      expect(url).toBe('http://localhost:3000/api/test?test=true')
    })

    it('should not add test parameter in production without explicit request', async () => {
      mockEnvironment({ NODE_ENV: 'production' })
      const AppEnvironment = await importFresh()
      const url = AppEnvironment.buildApiUrl('/api/test')
      expect(url).toBe('http://localhost:3000/api/test')
    })

    it('should handle absolute URLs correctly', async () => {
      delete (global as any).window
      const AppEnvironment = await importFresh()
      const url = AppEnvironment.buildApiUrl('https://api.example.com/test')
      expect(url).toBe('https://api.example.com/test')
    })

    it('should handle URLs with existing query parameters', async () => {
      delete (global as any).window
      const AppEnvironment = await importFresh()
      const url = AppEnvironment.buildApiUrl('/api/test?existing=param', {
        testMode: true,
      })
      expect(url).toBe(
        'http://localhost:3000/api/test?existing=param&test=true',
      )
    })
  })

  describe('isTestModeFromUrl', () => {
    it('should detect test mode from URL string in development', async () => {
      mockEnvironment({ NODE_ENV: 'development' })
      const AppEnvironment = await importFresh()
      const isTestMode = AppEnvironment.isTestModeFromUrl(
        'http://localhost:3000/api/test?test=true',
      )
      expect(isTestMode).toBe(true)
    })

    it('should detect test mode from URL object in development', async () => {
      mockEnvironment({ NODE_ENV: 'development' })
      const AppEnvironment = await importFresh()
      const url = new URL('http://localhost:3000/api/test?test=true')
      const isTestMode = AppEnvironment.isTestModeFromUrl(url)
      expect(isTestMode).toBe(true)
    })

    it('should return false in production even with test parameter', async () => {
      mockEnvironment({ NODE_ENV: 'production' })
      const AppEnvironment = await importFresh()
      const isTestMode = AppEnvironment.isTestModeFromUrl(
        'http://localhost:3000/api/test?test=true',
      )
      expect(isTestMode).toBe(false)
    })

    it('should return false without test parameter', async () => {
      mockEnvironment({ NODE_ENV: 'development' })
      const AppEnvironment = await importFresh()
      const isTestMode = AppEnvironment.isTestModeFromUrl(
        'http://localhost:3000/api/test',
      )
      expect(isTestMode).toBe(false)
    })

    it('should return false with test=false parameter', async () => {
      mockEnvironment({ NODE_ENV: 'development' })
      const AppEnvironment = await importFresh()
      const isTestMode = AppEnvironment.isTestModeFromUrl(
        'http://localhost:3000/api/test?test=false',
      )
      expect(isTestMode).toBe(false)
    })
  })

  describe('createMockAuthContext', () => {
    it('should throw error when test mode is disabled', async () => {
      mockEnvironment({ NODE_ENV: 'production' })
      const AppEnvironment = await importFresh()
      expect(() => AppEnvironment.createMockAuthContext()).toThrow(
        'createMockAuthContext can only be used in test mode.',
      )
    })

    it('should return mock auth context when test mode is enabled', async () => {
      mockEnvironment({
        NODE_ENV: 'development',
        NEXT_PUBLIC_ENABLE_TEST_MODE: 'true',
      })
      const AppEnvironment = await importFresh()
      const mockAuth = AppEnvironment.createMockAuthContext()

      expect(mockAuth).toMatchObject({
        user: {
          email: 'test@cloudnativedays.no',
          name: 'Test User',
          picture: expect.stringContaining('placehold.co'),
        },
        speaker: {
          _id: 'test-speaker-id',
          name: 'Test User',
          email: 'test@cloudnativedays.no',
          slug: 'test-user',
          isOrganizer: true,
        },
        expires: expect.any(String),
      })
    })

    it('should generate future expiration date', async () => {
      mockEnvironment({
        NODE_ENV: 'development',
        NEXT_PUBLIC_ENABLE_TEST_MODE: 'true',
      })
      const AppEnvironment = await importFresh()
      const mockAuth = AppEnvironment.createMockAuthContext()
      const expirationDate = new Date(mockAuth!.expires)
      const now = new Date()

      expect(expirationDate.getTime()).toBeGreaterThan(now.getTime())
      const hoursDiff =
        (expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60)
      expect(hoursDiff).toBeGreaterThan(23.98)
      expect(hoursDiff).toBeLessThan(24.02)
    })
  })

  describe('getTestModeFromRequest', () => {
    it('should detect test mode from request URL', async () => {
      mockEnvironment({ NODE_ENV: 'development' })
      const AppEnvironment = await importFresh()
      const req = { url: 'http://localhost:3000/api/test?test=true' }
      const isTestMode = AppEnvironment.getTestModeFromRequest(req)
      expect(isTestMode).toBe(true)
    })

    it('should return false for normal request URLs', async () => {
      mockEnvironment({ NODE_ENV: 'development' })
      const AppEnvironment = await importFresh()
      const req = { url: 'http://localhost:3000/api/test' }
      const isTestMode = AppEnvironment.getTestModeFromRequest(req)
      expect(isTestMode).toBe(false)
    })
  })

  describe('createMockAuthFromRequest', () => {
    it('should return mock auth when request has test mode enabled', async () => {
      mockEnvironment({
        NODE_ENV: 'development',
        NEXT_PUBLIC_ENABLE_TEST_MODE: 'true',
      })
      const AppEnvironment = await importFresh()
      const req = { url: 'http://localhost:3000/api/test?test=true' }
      const mockAuth = AppEnvironment.createMockAuthFromRequest(req)
      expect(mockAuth).not.toBeNull()
      expect(mockAuth?.user.email).toBe('test@cloudnativedays.no')
    })

    it('should return null when request does not have test mode', async () => {
      mockEnvironment({ NODE_ENV: 'development' })
      const AppEnvironment = await importFresh()
      const req = { url: 'http://localhost:3000/api/test' }
      const mockAuth = AppEnvironment.createMockAuthFromRequest(req)
      expect(mockAuth).toBeNull()
    })

    it('should return null in production regardless of URL', async () => {
      mockEnvironment({ NODE_ENV: 'production' })
      const AppEnvironment = await importFresh()
      const req = { url: 'http://localhost:3000/api/test?test=true' }
      const mockAuth = AppEnvironment.createMockAuthFromRequest(req)
      expect(mockAuth).toBeNull()
    })
  })

  describe('Static Method Context', () => {
    it('should not use this context in static methods', () => {
      const fs = require('fs')
      const path = require('path')

      const source = fs.readFileSync(
        path.join(process.cwd(), 'src/lib/environment/config.ts'),
        'utf-8',
      )

      const lines = source.split('\n')

      lines.forEach((line: string, index: number) => {
        if (
          line.trim().startsWith('//') ||
          line.trim().startsWith('*') ||
          line.trim().startsWith('/*')
        ) {
          return
        }

        if (line.includes('static') && line.includes('this.')) {
          throw new Error(
            `Line ${index + 1}: Static member should not use 'this' context: ${line.trim()}`,
          )
        }
      })
    })
  })
})
