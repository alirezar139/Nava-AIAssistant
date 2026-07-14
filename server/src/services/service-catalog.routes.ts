import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/auth.middleware.js';
import { sendError } from '../common/api-error.js';
import { AuthRequest } from '../common/types.js';
import { ExternalServiceMethod, ExternalServiceRecord } from '../database/database.js';
import { externalServiceRepository } from '../database/repositories.js';

export const serviceCatalogRouter = Router();

const serviceMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

const servicePayloadSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-zA-Z0-9_-]+$/),
  title: z.string().trim().min(2).max(160),
  purpose: z.string().trim().min(2).max(1000),
  sectionTitle: z.string().trim().max(160).optional().default(''),
  method: z.enum(serviceMethods).optional().default('POST'),
  url: z.string().trim().url().max(1000),
  authorizationHeader: z.string().trim().max(4000).optional().default(''),
  authHeader: z.string().trim().max(4000).optional().default(''),
  headersText: z.string().trim().max(6000).optional().default(''),
  bodyTemplate: z.string().trim().max(12000).optional().default(''),
  isActive: z.boolean().optional().default(true),
  showInAssistant: z.boolean().optional().default(true)
});

type ExternalServicePayload = z.infer<typeof servicePayloadSchema>;

interface ServiceExecutionResult {
  ok: boolean;
  status: number;
  statusText: string;
  durationMs: number;
  bodyPreview: string;
  executedAt: string;
  errorMessage?: string;
}

function getServices(): ExternalServiceRecord[] {
  return externalServiceRepository.list();
}

function toPublicService(
  service: ExternalServiceRecord
): Omit<ExternalServiceRecord, 'authorizationHeader' | 'authHeader' | 'headersText' | 'bodyTemplate'> {
  return {
    id: service.id,
    key: service.key,
    title: service.title,
    purpose: service.purpose,
    sectionTitle: service.sectionTitle,
    method: service.method,
    url: service.url,
    isActive: service.isActive,
    showInAssistant: service.showInAssistant,
    createdAt: service.createdAt,
    updatedAt: service.updatedAt
  };
}

function toCreateInput(payload: ExternalServicePayload): Omit<ExternalServiceRecord, 'id'> {
  const now = new Date().toISOString();
  return {
    key: payload.key,
    title: payload.title,
    purpose: payload.purpose,
    sectionTitle: payload.sectionTitle || payload.title,
    method: payload.method as ExternalServiceMethod,
    url: payload.url,
    authorizationHeader: payload.authorizationHeader,
    authHeader: payload.authHeader,
    headersText: payload.headersText,
    bodyTemplate: payload.bodyTemplate,
    isActive: payload.isActive,
    showInAssistant: payload.showInAssistant,
    createdAt: now,
    updatedAt: now
  };
}

function toRecord(payload: ExternalServicePayload, existing: ExternalServiceRecord): ExternalServiceRecord {
  return {
    ...toCreateInput(payload),
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString()
  };
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const normalized = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === normalized);
}

function parseExtraHeaders(value: string): Record<string, string> | null {
  const trimmed = value.trim();
  if (!trimmed) return {};

  if (trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, entryValue]) => typeof entryValue === 'string' || typeof entryValue === 'number')
        .map(([key, entryValue]) => [key.trim(), String(entryValue).trim()])
        .filter(([key, entryValue]) => key && entryValue)
    );
  }

  const headers: Record<string, string> = {};
  for (const rawLine of trimmed.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separatorIndex = line.indexOf(':');
    if (separatorIndex <= 0) return null;
    const key = line.slice(0, separatorIndex).trim();
    const headerValue = line.slice(separatorIndex + 1).trim();
    if (!key || !headerValue) return null;
    headers[key] = headerValue;
  }
  return headers;
}

function renderTemplate(template: string, request: AuthRequest): string {
  const user = request.user;
  const replacements: Record<string, string> = {
    username: user?.username ?? '',
    fullName: user?.fullName ?? '',
    userId: user?.id ? String(user.id) : '',
    role: user?.role ?? '',
    now: new Date().toISOString()
  };

  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => replacements[key] ?? '');
}

async function executeService(
  service: ExternalServiceRecord,
  request: AuthRequest
): Promise<ServiceExecutionResult> {
  const start = Date.now();
  const headers: Record<string, string> = {
    Accept: 'application/json'
  };
  const extraHeaders = parseExtraHeaders(service.headersText);
  if (!extraHeaders) {
    return {
      ok: false,
      status: 0,
      statusText: 'Invalid headers',
      durationMs: Date.now() - start,
      bodyPreview: '',
      executedAt: new Date().toISOString(),
      errorMessage: 'هدرهای سرویس معتبر نیستند.'
    };
  }

  Object.assign(headers, extraHeaders);
  if (service.authorizationHeader) headers['Authorization'] = service.authorizationHeader;
  if (service.authHeader) headers['Auth'] = service.authHeader;

  const method = service.method;
  const body =
    method === 'GET' || method === 'DELETE' ? undefined : renderTemplate(service.bodyTemplate, request);
  if (body && !hasHeader(headers, 'content-type')) {
    headers['Content-Type'] =
      body.trim().startsWith('{') || body.trim().startsWith('[') ? 'application/json' : 'text/plain';
  }

  try {
    const response = await fetch(service.url, {
      method,
      headers,
      body: body || undefined,
      signal: AbortSignal.timeout(10000)
    });
    const responseBody = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      durationMs: Date.now() - start,
      bodyPreview: responseBody.slice(0, 4000),
      executedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      statusText: 'Request failed',
      durationMs: Date.now() - start,
      bodyPreview: '',
      executedAt: new Date().toISOString(),
      errorMessage: error instanceof Error ? error.message : 'اجرای سرویس انجام نشد.'
    };
  }
}

serviceCatalogRouter.get('/', requireAuth(['admin']), (_request, response) => {
  response.json(getServices());
});

serviceCatalogRouter.get('/active', requireAuth(), (_request, response) => {
  response.json(
    getServices()
      .filter((service) => service.isActive && service.showInAssistant)
      .map(toPublicService)
  );
});

serviceCatalogRouter.post('/', requireAuth(['admin']), async (request, response) => {
  const result = servicePayloadSchema.safeParse(request.body);
  if (!result.success) {
    sendError(response, 400, 'SERVICE_INVALID', 'اطلاعات سرویس معتبر نیست.');
    return;
  }

  if (externalServiceRepository.keyExists(result.data.key)) {
    sendError(response, 409, 'SERVICE_KEY_EXISTS', 'کلید سرویس تکراری است.');
    return;
  }

  const record = await externalServiceRepository.create(toCreateInput(result.data));
  response.status(201).json(record);
});

serviceCatalogRouter.put('/:id', requireAuth(['admin']), async (request, response) => {
  const id = Number(request.params['id']);
  const existing = externalServiceRepository.findById(id);
  if (!existing) {
    sendError(response, 404, 'SERVICE_NOT_FOUND', 'سرویس پیدا نشد.');
    return;
  }

  const result = servicePayloadSchema.safeParse(request.body);
  if (!result.success) {
    sendError(response, 400, 'SERVICE_INVALID', 'اطلاعات سرویس معتبر نیست.');
    return;
  }

  if (externalServiceRepository.keyExists(result.data.key, id)) {
    sendError(response, 409, 'SERVICE_KEY_EXISTS', 'کلید سرویس تکراری است.');
    return;
  }

  const updated = toRecord(result.data, existing);
  response.json(await externalServiceRepository.update(id, updated));
});

serviceCatalogRouter.delete('/:id', requireAuth(['admin']), async (request, response) => {
  const id = Number(request.params['id']);
  const deleted = await externalServiceRepository.delete(id);
  if (!deleted) {
    sendError(response, 404, 'SERVICE_NOT_FOUND', 'سرویس پیدا نشد.');
    return;
  }

  response.status(204).send();
});

serviceCatalogRouter.post('/:id/test', requireAuth(['admin']), async (request: AuthRequest, response) => {
  const id = Number(request.params['id']);
  const service = externalServiceRepository.findById(id);
  if (!service) {
    sendError(response, 404, 'SERVICE_NOT_FOUND', 'سرویس پیدا نشد.');
    return;
  }

  response.json(await executeService(service, request));
});

serviceCatalogRouter.post('/:id/run', requireAuth(), async (request: AuthRequest, response) => {
  const id = Number(request.params['id']);
  const service = externalServiceRepository.findById(id);
  if (!service || !service.isActive || !service.showInAssistant) {
    sendError(response, 404, 'SERVICE_NOT_AVAILABLE', 'سرویس فعال برای اجرا پیدا نشد.');
    return;
  }

  response.json(await executeService(service, request));
});
