/**
 * Centralized logger for structured logging
 * This can be replaced with a more sophisticated logging solution (e.g., Winston, Pino) later
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  [key: string]: unknown
}

/**
 * Masks or hashes PII in log data
 */
function sanitizePII(data: unknown): unknown {
  if (typeof data === 'string' && data.includes('@')) {
    // Simple email masking
    return data.replace(
      /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
      (match, local, domain) => {
        const maskedLocal =
          local.length > 2 ? local.substring(0, 2) + '***' : '***'
        return `${maskedLocal}@${domain}`
      },
    )
  }

  if (typeof data === 'object' && data !== null) {
    if (Array.isArray(data)) {
      return data.map((item) => sanitizePII(item))
    }

    const sanitized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data)) {
      // Recursively sanitize nested objects
      if (key === 'email' || key === 'recipient') {
        sanitized[key] = sanitizePII(value)
      } else if (typeof value === 'object') {
        sanitized[key] = sanitizePII(value)
      } else {
        sanitized[key] = value
      }
    }
    return sanitized
  }

  return data
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development'

  private log(level: LogLevel, message: string, context?: LogContext): void {
    const timestamp = new Date().toISOString()
    const sanitizedContext = context ? sanitizePII(context) : undefined

    const logData: Record<string, unknown> = {
      timestamp,
      level,
      message,
    }

    if (sanitizedContext) {
      logData.context = sanitizedContext
    }

    // In production, use structured JSON logging
    if (!this.isDevelopment) {
      const logString = JSON.stringify(logData)

      switch (level) {
        case 'error':
          console.error(logString)
          break
        case 'warn':
          console.warn(logString)
          break
        case 'info':
          console.info(logString)
          break
        case 'debug':
          console.debug(logString)
          break
      }
    } else {
      // In development, use more readable format
      const prefix = `[${timestamp}] [${level.toUpperCase()}]`
      const formattedMessage = `${prefix} ${message}`

      switch (level) {
        case 'error':
          console.error(formattedMessage, sanitizedContext || '')
          break
        case 'warn':
          console.warn(formattedMessage, sanitizedContext || '')
          break
        case 'info':
          console.info(formattedMessage, sanitizedContext || '')
          break
        case 'debug':
          console.debug(formattedMessage, sanitizedContext || '')
          break
      }
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context)
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context)
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context)
  }

  error(message: string, context?: LogContext): void {
    this.log('error', message, context)
  }
}

export const logger = new Logger()
