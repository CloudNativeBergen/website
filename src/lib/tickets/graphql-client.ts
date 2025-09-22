const CHECKIN_API_URL = 'https://api.checkin.no/graphql'
const CHECKIN_API_KEY = process.env.CHECKIN_API_KEY
const CHECKIN_API_SECRET = process.env.CHECKIN_API_SECRET

export interface GraphQLError {
  message: string
}

export interface GraphQLResponse<T> {
  data?: T
  errors?: GraphQLError[]
}

export interface GraphQLRequest {
  query: string
  variables?: Record<string, unknown>
}

export class CheckinGraphQLClient {
  private readonly apiUrl: string
  private readonly apiKey: string | undefined
  private readonly apiSecret: string | undefined

  constructor() {
    this.apiUrl = CHECKIN_API_URL
    this.apiKey = CHECKIN_API_KEY
    this.apiSecret = CHECKIN_API_SECRET

    if (!this.apiKey || !this.apiSecret) {
      console.warn(
        '⚠️  Checkin API credentials not found. Check CHECKIN_API_KEY and CHECKIN_API_SECRET environment variables.',
      )
      console.warn(
        '   Without these credentials, ticket and discount management features will not work.',
      )
    }
  }

  isConfigured(): boolean {
    return !!(this.apiKey && this.apiSecret)
  }

  async execute<T>(request: GraphQLRequest): Promise<T> {
    if (!this.isConfigured()) {
      throw new Error(
        'Checkin.no API is not configured. Please check CHECKIN_API_KEY and CHECKIN_API_SECRET environment variables.',
      )
    }

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        let errorMessage = `GraphQL request failed: ${response.status} ${response.statusText}`

        try {
          const errorBody = await response.text()
          if (errorBody) {
            errorMessage += ` - ${errorBody}`
          }
        } catch {}

        console.error(errorMessage)
        throw new Error(errorMessage)
      }

      const responseData: GraphQLResponse<T> = await response.json()

      if (responseData.errors && responseData.errors.length > 0) {
        const errorMessage = responseData.errors
          .map((e) => e.message)
          .join('; ')

        // Enhanced error logging for debugging
        console.error('GraphQL Request Failed:', {
          errors: responseData.errors,
          query: request.query.substring(0, 200) + '...',
          variables: request.variables,
          url: this.apiUrl,
          hasAuth: !!(this.apiKey && this.apiSecret),
          apiKeyLength: this.apiKey?.length || 0,
          secretLength: this.apiSecret?.length || 0,
        })

        const hasAuthError = responseData.errors.some(
          (error) =>
            error.message.toLowerCase().includes('authorize') ||
            error.message.toLowerCase().includes('unauthorized') ||
            error.message.toLowerCase().includes('forbidden'),
        )

        if (hasAuthError) {
          throw new Error(
            `Access denied: ${errorMessage}. This usually means:\\n` +
              `1. API credentials don't have access to this event/organization\\n` +
              `2. The event ID or customer ID is incorrect\\n` +
              `3. API credentials are invalid or expired\\n` +
              `\\nPlease verify CHECKIN_API_KEY, CHECKIN_API_SECRET, and the event configuration.`,
          )
        }

        throw new Error(`GraphQL errors: ${errorMessage}`)
      }

      if (!responseData.data) {
        console.error('Invalid GraphQL response - no data:', responseData)
        throw new Error('Invalid GraphQL response - no data received')
      }

      return responseData.data
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error(
          `Network error connecting to Checkin.no API: ${error.message}`,
        )
      }
      throw error
    }
  }

  async query<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    return this.execute<T>({ query, variables })
  }

  async mutate<T>(
    mutation: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    return this.execute<T>({ query: mutation, variables })
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (this.apiKey && this.apiSecret) {
      headers.Authorization = `Basic ${this.apiKey}:${this.apiSecret}`
    }

    return headers
  }
}

export const checkinGraphQLClient = new CheckinGraphQLClient()

export async function checkinQuery<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  return checkinGraphQLClient.query<T>(query, variables)
}

export async function checkinMutation<T>(
  mutation: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  return checkinGraphQLClient.mutate<T>(mutation, variables)
}
