const defaultOrigins = ['http://localhost:4200', 'http://127.0.0.1:4200'];

export const config = {
  host: process.env['HOST'] ?? '127.0.0.1',
  port: Number(process.env['PORT'] ?? 3000),
  jwtSecret: process.env['JWT_SECRET'] ?? 'change-this-secret-before-production',
  corsOrigins:
    process.env['CORS_ORIGINS']
      ?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? defaultOrigins,
  sahandTicketUrl: process.env['SAHAND_TICKET_URL'] ?? '',
  sahandApiKey: process.env['SAHAND_API_KEY'] ?? ''
} as const;
