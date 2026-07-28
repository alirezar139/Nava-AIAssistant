import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware.js';
import { dashboardMetricRepository } from '../database/repositories.js';

export const dashboardRouter = Router();

dashboardRouter.get('/metric-logs', requireAuth(['admin']), async (_request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.json(await dashboardMetricRepository.list());
});
