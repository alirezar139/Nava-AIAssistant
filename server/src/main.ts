import cors from 'cors';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { authRouter } from './auth/auth.routes.js';
import { conversationRouter } from './conversations/conversation.routes.js';
import { faqRouter } from './faqs/faq.routes.js';
import './database/database.js';
import { config } from './config/config.js';
import { sendError } from './common/api-error.js';

const app = express();

app.use((_request, response, next) => {
  const traceId = randomUUID().slice(0, 8);
  response.locals['traceId'] = traceId;
  response.setHeader('X-Trace-Id', traceId);
  next();
});
app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: '10mb' }));
app.get('/api/health', (_request, response) => response.json({ status: 'ok' }));
app.use('/api/auth', authRouter);
app.use('/api/faqs', faqRouter);
app.use('/api/conversations', conversationRouter);

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
