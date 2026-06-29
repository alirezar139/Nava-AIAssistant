import { config } from '../config/config.js';

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

export async function submitSahandTicket(payload: SahandTicketPayload): Promise<SahandTicketResult> {
  if (!config.sahandTicketUrl) {
    return { status: 'not_configured', ticketId: null, trackingId: null };
  }

  try {
    const response = await fetch(config.sahandTicketUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.sahandApiKey ? { Authorization: `Bearer ${config.sahandApiKey}` } : {})
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return { status: 'failed', ticketId: null, trackingId: null };
    }

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const ticketId =
      String(data['ticketId'] ?? data['issueKey'] ?? data['key'] ?? data['id'] ?? '').trim() || null;
    const trackingId =
      String(
        data['trackingCode'] ?? data['trackingId'] ?? data['code'] ?? data['requestId'] ?? ticketId ?? ''
      ).trim() || null;

    return { status: 'submitted', ticketId, trackingId };
  } catch {
    return { status: 'failed', ticketId: null, trackingId: null };
  }
}
