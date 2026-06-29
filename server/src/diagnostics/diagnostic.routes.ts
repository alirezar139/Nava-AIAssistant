import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/auth.middleware.js';
import { AuthRequest } from '../common/types.js';
import { database, DiagnosticCaseRecord, nextId } from '../database/database.js';
import { sendError } from '../common/api-error.js';
import { submitSahandTicket } from '../sahand/sahand-ticket.service.js';

export const diagnosticRouter = Router();

const diagnosticPayloadSchema = z.object({
  title: z.string().trim().min(3),
  problem: z.string().trim().min(5),
  systemName: z.string().trim().min(2),
  processName: z.string().trim().min(2),
  scenario: z.string().trim().min(3),
  serialNumber: z.string().trim().optional().default(''),
  errorText: z.string().trim().optional().default(''),
  evidence: z.string().trim().optional().default('')
});

diagnosticRouter.get('/', requireAuth(['admin']), (_request, response) => {
  const rows = database.data.diagnosticCases
    .map((item) => {
      const user = database.data.users.find((candidate) => candidate.id === item.userId);
      return {
        ...item,
        userFullName: user?.fullName ?? 'کاربر حذف‌شده',
        username: user?.username ?? '-'
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  response.json(rows);
});

diagnosticRouter.post('/', requireAuth(), async (request: AuthRequest, response) => {
  const result = diagnosticPayloadSchema.safeParse(request.body);
  if (!result.success || !request.user) {
    sendError(response, 400, 'DIAGNOSTIC_INVALID', 'اطلاعات پرونده بررسی معتبر نیست.');
    return;
  }

  const diagnosticCase: DiagnosticCaseRecord = {
    id: nextId(database.data.diagnosticCases),
    userId: request.user.id,
    title: result.data.title,
    problem: result.data.problem,
    systemName: result.data.systemName,
    processName: result.data.processName,
    scenario: result.data.scenario,
    serialNumber: result.data.serialNumber,
    errorText: result.data.errorText,
    evidence: result.data.evidence,
    status: 'draft',
    analysisSummary: null,
    severity: null,
    recommendation: null,
    externalTicketId: null,
    externalTrackingId: null,
    externalTicketStatus: null,
    createdAt: new Date().toISOString(),
    analyzedAt: null
  };

  const ticketResult = await submitSahandTicket({
    title: result.data.title.slice(0, 120),
    description: [
      `عنوان مشکل: ${result.data.title}`,
      `شرح مشکل: ${result.data.problem}`,
      `سامانه: ${result.data.systemName}`,
      `سناریو/فرآیند: ${result.data.processName}`,
      `مسیر اجرا: ${result.data.scenario}`,
      `شناسه/سریال: ${result.data.serialNumber || '-'}`,
      `متن خطا: ${result.data.errorText || '-'}`,
      `مستندات: ${result.data.evidence || '-'}`
    ].join('\n'),
    requester: {
      username: request.user.username,
      fullName: request.user.fullName
    },
    metadata: {
      source: 'nava-ai-assistant',
      localDiagnosticId: String(diagnosticCase.id)
    }
  });
  diagnosticCase.externalTicketId = ticketResult.ticketId;
  diagnosticCase.externalTrackingId = ticketResult.trackingId;
  diagnosticCase.externalTicketStatus = ticketResult.status;

  database.data.diagnosticCases.push(diagnosticCase);
  await database.write();
  response.status(201).json(diagnosticCase);
});

diagnosticRouter.post('/:id/analyze', requireAuth(), async (request: AuthRequest, response) => {
  const id = Number(request.params['id']);
  const item = database.data.diagnosticCases.find((candidate) => candidate.id === id);
  if (!item || (request.user?.role !== 'admin' && item.userId !== request.user?.id)) {
    sendError(response, 404, 'DIAGNOSTIC_NOT_FOUND', 'پرونده بررسی پیدا نشد.');
    return;
  }

  const joinedText = `${item.title ?? ''} ${item.problem} ${item.processName ?? ''} ${item.scenario} ${
    item.errorText ?? ''
  } ${item.evidence}`.toLowerCase();
  const severity: DiagnosticCaseRecord['severity'] = /خطای ۵۰۰|500|قطع|critical|ناموفق|failed/.test(
    joinedText
  )
    ? 'high'
    : /کند|تاخیر|warning|هشدار/.test(joinedText)
      ? 'medium'
      : 'low';

  item.status = severity === 'high' ? 'escalated' : 'analyzed';
  item.severity = severity;
  item.analysisSummary = `تحلیل اولیه برای ${item.systemName}: مشکل با سناریوی اعلام‌شده و شواهد کاربر بررسی شد.`;
  item.recommendation =
    severity === 'high'
      ? 'پرونده باید همراه با سریال/شناسه و شواهد برای تیم تحلیل داده یا پشتیبانی سطح دو ارسال شود.'
      : 'ابتدا اعتبار دسترسی، مسیر انجام عملیات و داده ورودی کنترل شود. در صورت تکرار، پرونده به تحلیل داده ارجاع شود.';
  item.analyzedAt = new Date().toISOString();

  await database.write();
  response.json(item);
});
