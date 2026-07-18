import cors from 'cors';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authRouter } from './auth/auth.routes.js';
import { conversationRouter } from './conversations/conversation.routes.js';
import { diagnosticRouter } from './diagnostics/diagnostic.routes.js';
import { faqRouter } from './faqs/faq.routes.js';
import { settingsRouter } from './settings/settings.routes.js';
import { serviceCatalogRouter } from './services/service-catalog.routes.js';
import { troubleshootingTreeRouter } from './troubleshooting-tree/troubleshooting-tree.routes.js';
import './database/database.js';
import { ensureArangoSchema, getArangoHealth, isArangoEnabled } from './database/arango.js';
import { config } from './config/config.js';
import { sendError } from './common/api-error.js';

await ensureArangoSchema();

const app = express();

app.use((_request, response, next) => {
  const traceId = randomUUID().slice(0, 8);
  response.locals['traceId'] = traceId;
  response.setHeader('X-Trace-Id', traceId);
  next();
});
app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: '10mb' }));
app.get('/api/health', async (_request, response) => {
  const arango = await getArangoHealth();
  response.status(arango.ok ? 200 : 503).json({
    status: arango.ok ? 'ok' : 'degraded',
    storage: config.databaseProvider,
    ...(isArangoEnabled() ? { arango } : {})
  });
});
app.use('/api/auth', authRouter);
app.use('/api/faqs', faqRouter);
app.use('/api/conversations', conversationRouter);
app.use('/api/diagnostics', diagnosticRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/services', serviceCatalogRouter);
app.use('/api/troubleshooting-tree', troubleshootingTreeRouter);

const frontendDistPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist/nava-ai-assistant');
const frontendIndexPath = join(frontendDistPath, 'index.html');

if (existsSync(frontendIndexPath)) {
  app.use(
    express.static(frontendDistPath, {
      setHeaders(response, assetPath) {
        if (assetPath.endsWith('.html')) {
          response.setHeader('Cache-Control', 'no-store');
          return;
        }

        const isHashedAsset = /\.[a-f0-9]{12,}\./i.test(assetPath);
        response.setHeader(
          'Cache-Control',
          isHashedAsset ? 'public, max-age=31536000, immutable' : 'public, max-age=3600'
        );
      }
    })
  );
  app.get(/^(?!\/api).*/, (_request, response) => response.sendFile(frontendIndexPath));
}

app.use((_request, response) => sendError(response, 404, 'ROUTE_NOT_FOUND', 'مسیر درخواست‌شده پیدا نشد.'));
app.use(
  (error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    const traceId = response.locals['traceId'] as string;
    console.error(`[${traceId}]`, error);
    sendError(response, 500, 'INTERNAL_ERROR', 'خطای داخلی در سامانه رخ داد.');
  }
);
app.listen(config.port, config.host, () => {
  console.log(`API listening on http://${config.host}:${config.port}`);
});
