import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware.js';
import { dashboardMetricRepository } from '../database/repositories.js';
import { listSystemLogDates, readSystemLog, SystemLogLevel } from './system-log.repository.js';

export const dashboardRouter = Router();

dashboardRouter.get('/metric-logs', requireAuth(['admin', 'developer']), async (_request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.json(await dashboardMetricRepository.list());
});

dashboardRouter.get('/system-log-dates', requireAuth(['developer']), async (_request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.json(await listSystemLogDates());
});

dashboardRouter.get('/system-logs', requireAuth(['developer']), async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');

  const dateParam = request.query['date'];
  const date =
    typeof dateParam === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : new Date().toISOString().slice(0, 10);

  const levelParam = request.query['level'];
  const level: SystemLogLevel | undefined =
    levelParam === 'info' || levelParam === 'warn' || levelParam === 'error' ? levelParam : undefined;

  const searchParam = request.query['search'];
  const search = typeof searchParam === 'string' ? searchParam : undefined;

  const limitParam = Number(request.query['limit']);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.trunc(limitParam), 1), 1000) : 300;

  response.json({ date, entries: await readSystemLog(date, { level, search, limit }) });
});
