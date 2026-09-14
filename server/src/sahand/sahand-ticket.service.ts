import { config } from '../config/config.js';
import { settingsRepository } from '../database/repositories.js';
import { logger } from '../common/logger.js';

export interface SahandTicketPayload {
  title: string;
  description: string;
  requester: {
    username: string;
    fullName: string;
  };
  metadata: Record<string, string>;
}

export interface SahandTicketResult {
  status: 'not_configured' | 'submitted' | 'failed';
  ticketId: string | null;
  trackingId: string | null;
  statusCode: number | null;
  errorMessage: string | null;
}

async function resolveTicketRoute(
  treeNodeId: string
): Promise<{ serviceDeskId: string; requestTypeId: string }> {
  const ticketServiceSettings = await settingsRepository.getTicketServiceSettings();
  const nodeMapping = ticketServiceSettings?.requestTypeMappings?.find(
    (item) => item.nodeId.trim() === treeNodeId.trim()
  );

  return {
    serviceDeskId:
      nodeMapping?.serviceDeskId.trim() ||
      ticketServiceSettings?.serviceDeskId.trim() ||
      config.sahandServiceDeskId.trim(),
    requestTypeId:
      nodeMapping?.requestTypeId.trim() ||
      ticketServiceSettings?.requestTypeId.trim() ||
      config.sahandRequestTypeId.trim()
  };
}

function buildAuthorizationHeader(configuredAuthorization: string): string | null {
  const savedAuthorization = configuredAuthorization.trim();

  if (savedAuthorization) {
    return savedAuthorization;
  }

  const environmentAuthorization = config.sahandAuthorization.trim();

  if (environmentAuthorization) {
    return environmentAuthorization;
  }

  const apiKey = config.sahandApiKey.trim();

  if (apiKey) {
    return /^(basic|bearer)\s+/i.test(apiKey) ? apiKey : `Bearer ${apiKey}`;
  }

  const username = config.sahandUsername.trim();
  const password = config.sahandPassword;

  if (username && password) {
    return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }

  return null;
}

function compactErrorMessage(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 1000);
}

function buildFailureMessage(status: number, statusText: string, responseBody: string): string {
  const responsePreview = compactErrorMessage(responseBody);
  const statusLabel = [status, statusText].filter(Boolean).join(' ');

  if (responsePreview) {
    return `Sahand rejected the request (${statusLabel}): ${responsePreview}`;
  }

  if (status === 401 || status === 403) {
    return `Sahand rejected the Authorization header (${statusLabel}).`;
  }

  return `Sahand request failed (${statusLabel}).`;
}

function parseResponseBody(value: string): Record<string, unknown> {
  if (!value.trim()) return {};

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function submitSahandTicket(payload: SahandTicketPayload): Promise<SahandTicketResult> {
  const ticketServiceSettings = await settingsRepository.getTicketServiceSettings();
  const ticketUrl = ticketServiceSettings?.url.trim() || config.sahandTicketUrl.trim();
  const { serviceDeskId, requestTypeId } = await resolveTicketRoute(payload.metadata['treeNodeId'] ?? '');
  const authorization = buildAuthorizationHeader(ticketServiceSettings?.authorizationHeader ?? '');
  const authHeader = ticketServiceSettings?.authHeader.trim() || config.sahandAuthHeader.trim();
  const raiseOnBehalfOf =
    ticketServiceSettings?.raiseOnBehalfOf.trim() ||
    config.sahandRaiseOnBehalfOf.trim() ||
    payload.requester.username;

  if (!ticketUrl || !serviceDeskId || !requestTypeId || !authorization) {
    return {
      status: 'not_configured',
      ticketId: null,
      trackingId: null,
      statusCode: null,
      errorMessage: 'Sahand ticket service is not fully configured.'
    };
  }

  const requestBody = {
    serviceDeskId,
    requestTypeId,
    requestFieldValues: {
      summary: payload.title,
      description: payload.description
    },
    raiseOnBehalfOf
  };

  try {
    const response = await fetch(ticketUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: authorization,
        ...(authHeader ? { Auth: authHeader } : {})
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(45000)
    });
    const responseBody = await response.text();

    if (!response.ok) {
      const errorMessage = buildFailureMessage(response.status, response.statusText, responseBody);
      logger.warn(`sahand ticket submission rejected: ${errorMessage}`, { status: response.status });
      return {
        status: 'failed',
        ticketId: null,
        trackingId: null,
        statusCode: response.status,
        errorMessage
      };
    }

    const data = parseResponseBody(responseBody);
    const ticketId =
      String(
        data['issueKey'] ?? data['key'] ?? data['ticketId'] ?? data['issueId'] ?? data['id'] ?? ''
      ).trim() || null;
    const trackingId =
      String(
        data['requestId'] ??
          data['trackingCode'] ??
          data['trackingId'] ??
          data['code'] ??
          data['issueId'] ??
          ticketId ??
          ''
      ).trim() || null;

    return { status: 'submitted', ticketId, trackingId, statusCode: response.status, errorMessage: null };
  } catch (error) {
    const isTimeout =
      error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    const causeCode =
      error instanceof Error && error.cause instanceof Error && 'code' in error.cause
        ? String((error.cause as { code?: unknown }).code)
        : null;

    let errorMessage: string;
    if (isTimeout) {
      errorMessage =
        'سرویس سهند در زمان مقرر پاسخ نداد. ممکن است تیکت با تأخیر ثبت شده باشد؛ لطفاً از طریق سهند بررسی کنید یا دوباره تلاش کنید.';
    } else if (causeCode === 'ENOTFOUND') {
      errorMessage = `آدرس سرویس سهند (${ticketUrl}) شناسایی نشد. اتصال VPN/شبکه داخلی یا صحت آدرس را بررسی کنید.`;
    } else if (causeCode === 'ECONNREFUSED' || causeCode === 'ETIMEDOUT') {
      errorMessage = 'اتصال به سرویس سهند برقرار نشد. شبکه یا در دسترس بودن سرویس را بررسی کنید.';
    } else if (error instanceof Error) {
      errorMessage = compactErrorMessage(error.message);
    } else {
      errorMessage = 'برقراری ارتباط با سرویس سهند ممکن نشد.';
    }

    logger.warn(`sahand ticket submission failed: ${errorMessage}`, { causeCode });
    return {
      status: 'failed',
      ticketId: null,
      trackingId: null,
      statusCode: null,
      errorMessage
    };
  }
}
