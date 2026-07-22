import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/auth.middleware.js';
import { config } from '../config/config.js';
import { TicketServiceSettingsRecord } from '../database/database.js';
import { settingsRepository } from '../database/repositories.js';

export const settingsRouter = Router();

const ticketServiceSettingsSchema = z.object({
  url: z.string().trim().max(1000).optional().default(''),
  authorizationHeader: z.string().trim().max(4000).optional().default(''),
  authHeader: z.string().trim().max(4000).optional().default(''),
  raiseOnBehalfOf: z.string().trim().max(200).optional().default(''),
  serviceDeskId: z.string().trim().max(100).optional().default(''),
  requestTypeId: z.string().trim().max(100).optional().default(''),
  requestTypeMappings: z
    .array(
      z.object({
        nodeId: z.string().trim().min(1).max(200),
        nodeLabel: z.string().trim().max(500).optional().default(''),
        serviceDeskId: z.string().trim().max(100).optional().default(''),
        requestTypeId: z.string().trim().min(1).max(100)
      })
    )
    .optional()
    .default([])
});

async function getStoredTicketServiceSettings(): Promise<TicketServiceSettingsRecord> {
  return settingsRepository.getTicketServiceSettings();
}

settingsRouter.get('/ticket-service', requireAuth(['admin']), async (_request, response) => {
  const stored = await getStoredTicketServiceSettings();

  response.json({
    url: stored.url || config.sahandTicketUrl,
    authorizationHeader: stored.authorizationHeader || config.sahandAuthorization,
    authHeader: stored.authHeader || config.sahandAuthHeader,
    raiseOnBehalfOf: stored.raiseOnBehalfOf || config.sahandRaiseOnBehalfOf,
    serviceDeskId: stored.serviceDeskId || config.sahandServiceDeskId,
    requestTypeId: stored.requestTypeId || config.sahandRequestTypeId,
    requestTypeMappings: stored.requestTypeMappings,
    updatedAt: stored.updatedAt
  });
});

settingsRouter.put('/ticket-service', requireAuth(['admin']), async (request, response) => {
  const result = ticketServiceSettingsSchema.safeParse(request.body);

  if (!result.success) {
    response.status(400).json({ code: 'SETTINGS_INVALID', message: 'تنظیمات سرویس معتبر نیست.' });
    return;
  }

  const updated: TicketServiceSettingsRecord = {
    url: result.data.url,
    authorizationHeader: result.data.authorizationHeader,
    authHeader: result.data.authHeader,
    raiseOnBehalfOf: result.data.raiseOnBehalfOf,
    serviceDeskId: result.data.serviceDeskId,
    requestTypeId: result.data.requestTypeId,
    requestTypeMappings: result.data.requestTypeMappings,
    updatedAt: new Date().toISOString()
  };

  response.json(await settingsRepository.updateTicketServiceSettings(updated));
});
