const defaultOrigins = ['http://localhost:4200', 'http://127.0.0.1:4200'];
const databaseProvider = (process.env['DB_PROVIDER'] ?? 'lowdb').trim().toLowerCase();

export const config = {
  host: process.env['HOST'] ?? '127.0.0.1',
  port: Number(process.env['PORT'] ?? 3000),
  jwtSecret: process.env['JWT_SECRET'] ?? 'change-this-secret-before-production',
  databaseProvider: databaseProvider === 'arango' ? 'arango' : 'lowdb',
  dataDirectory: process.env['RAHYAR_DATA_DIR'] ?? '',
  dataFileName: process.env['RAHYAR_DB_FILE'] ?? 'database.json',
  arangoUrl: process.env['ARANGO_URL'] ?? 'http://127.0.0.1:8529',
  arangoDatabase: process.env['ARANGO_DATABASE'] ?? 'rahyar',
  arangoUsername: process.env['ARANGO_USERNAME'] ?? 'root',
  arangoPassword: process.env['ARANGO_PASSWORD'] ?? '',
  corsOrigins:
    process.env['CORS_ORIGINS']
      ?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? defaultOrigins,
  sahandTicketUrl: process.env['SAHAND_TICKET_URL'] ?? '',
  sahandApiKey: process.env['SAHAND_API_KEY'] ?? '',
  sahandAuthorization: process.env['SAHAND_AUTHORIZATION'] ?? '',
  sahandAuthHeader: process.env['SAHAND_AUTH_HEADER'] ?? '',
  sahandUsername: process.env['SAHAND_USERNAME'] ?? '',
  sahandPassword: process.env['SAHAND_PASSWORD'] ?? '',
  sahandServiceDeskId: process.env['SAHAND_SERVICE_DESK_ID'] ?? '',
  sahandRequestTypeId: process.env['SAHAND_REQUEST_TYPE_ID'] ?? '',
  sahandRaiseOnBehalfOf: process.env['SAHAND_RAISE_ON_BEHALF_OF'] ?? ''
} as const;
