export const TravelSupportConfig = {
  auditLog: {
    enabled: true,

    levels: {
      statusUpdate: 'info' as const,
      bankingUpdate: 'info' as const,
      expenseUpdate: 'info' as const,
      securityViolation: 'error' as const,
    },

    includeFields: [
      'timestamp',
      'operation',
      'adminId',
      'adminName',
      'details',
    ],
  },

  timeouts: {
    fileUpload: 30000,

    exchangeRateApi: 10000,

    generalApi: 5000,
  },

  fileUpload: {
    maxFileSize: 10 * 1024 * 1024,

    allowedTypes: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'],
  },

  exchangeRates: {
    cacheDuration: 24 * 60 * 60 * 1000,

    cacheKey: 'exchange_rates_cache',

    apiCallDelay: 100,
  },

  validation: {
    maxDescriptionLength: 500,

    maxLocationLength: 100,

    minExpenseAmount: 0.01,

    maxExpenseAgeYears: 2,
  },

  businessRules: {
    maxAmountByCategory: {
      accommodation: 5000,
      transportation: 10000,
      meals: 1000,
      visa: 2000,
      other: 3000,
    },
  },
} as const

export type TimeoutConfig = typeof TravelSupportConfig.timeouts

export const TIMEOUTS = TravelSupportConfig.timeouts
export const FILE_UPLOAD_CONFIG = TravelSupportConfig.fileUpload
export const EXCHANGE_RATE_CONFIG = TravelSupportConfig.exchangeRates
export const VALIDATION_CONFIG = TravelSupportConfig.validation
export const BUSINESS_RULES = TravelSupportConfig.businessRules
export const AUDIT_CONFIG = TravelSupportConfig.auditLog
