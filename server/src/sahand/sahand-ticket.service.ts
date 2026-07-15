import { config } from '../config/config.js';
import { settingsRepository } from '../database/repositories.js';

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

export async function submitSahandTicket(payload: SahandTicketPayload): Promise<SahandTicketResult> {
  const ticketServiceSettings = await settingsRepository.getTicketServiceSettings();
  const ticketUrl = ticketServiceSettings?.url.trim() || config.sahandTicketUrl.trim();
  const { serviceDeskId, requestTypeId } = await resolveTicketRoute(payload.metadata['treeNodeId'] ?? '');
  const authorization = buildAuthorizationHeader(ticketServiceSettings?.authorizationHeader ?? '');
  const authHeader = ticketServiceSettings?.authHeader.trim() || config.sahandAuthHeader.trim();

  if (!ticketUrl || !serviceDeskId || !requestTypeId || !authorization) {
    return { status: 'not_configured', ticketId: null, trackingId: null };
  }

  const requestBody = {
    serviceDeskId,
    requestTypeId,
    requestFieldValues: {
      summary: payload.title,
      description: payload.description
    },
    ...(config.sahandRaiseOnBehalfOf.trim()
      ? { raiseOnBehalfOf: config.sahandRaiseOnBehalfOf.trim() }
      : { raiseOnBehalfOf: payload.requester.username })
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
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      return { status: 'failed', ticketId: null, trackingId: null };
    }

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
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

    return { status: 'submitted', ticketId, trackingId };
  } catch {
    return { status: 'failed', ticketId: null, trackingId: null };
  }
}
