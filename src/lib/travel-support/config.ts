/**
 * Configuration constants for the Travel Support system
 */

export const TravelSupportConfig = {
  // Audit logging configuration
  auditLog: {
    // Whether to enable audit logging
    enabled: true,

    // Log levels for different operations
    levels: {
      statusUpdate: 'info' as const,
      bankingUpdate: 'info' as const,
      expenseUpdate: 'info' as const,
      securityViolation: 'error' as const,
    },

    // Fields to include in audit logs
    includeFields: [
      'timestamp',
      'operation',
      'adminId',
      'adminName',
      'details',
    ],
  },

  // Network timeout configurations
  timeouts: {
    // File upload timeout (30 seconds)
    fileUpload: 30000,

    // Exchange rate API timeout (10 seconds)
    exchangeRateApi: 10000,

    // General API timeout (5 seconds)
    generalApi: 5000,
  },

  // File upload limits
  fileUpload: {
    // Maximum file size in bytes (10MB)
    maxFileSize: 10 * 1024 * 1024,

    // Allowed file types for receipts
    allowedTypes: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'],
  },

  // Exchange rate cache configuration
  exchangeRates: {
    // Cache duration in milliseconds (24 hours)
    cacheDuration: 24 * 60 * 60 * 1000,

    // localStorage cache key
    cacheKey: 'exchange_rates_cache',

    // Delay between API calls to avoid rate limits (ms)
    apiCallDelay: 100,
  },

  // Validation limits
  validation: {
    // Maximum description length
    maxDescriptionLength: 500,

    // Maximum location length
    maxLocationLength: 100,

    // Minimum expense amount
    minExpenseAmount: 0.01,

    // Maximum expense age in years
    maxExpenseAgeYears: 2,
  },

  // Business rule limits
  businessRules: {
    // Maximum reasonable amounts by category (in base currency)
    maxAmountByCategory: {
      accommodation: 5000,
      transportation: 10000,
      meals: 1000,
      visa: 2000,
      other: 3000,
    },
  },
} as const

// Type for timeout configuration
export type TimeoutConfig = typeof TravelSupportConfig.timeouts

// Export individual timeout constants for convenience
export const TIMEOUTS = TravelSupportConfig.timeouts
export const FILE_UPLOAD_CONFIG = TravelSupportConfig.fileUpload
export const EXCHANGE_RATE_CONFIG = TravelSupportConfig.exchangeRates
export const VALIDATION_CONFIG = TravelSupportConfig.validation
export const BUSINESS_RULES = TravelSupportConfig.businessRules
export const AUDIT_CONFIG = TravelSupportConfig.auditLog
