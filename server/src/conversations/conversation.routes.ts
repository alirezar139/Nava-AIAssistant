import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/auth.middleware.js';
import { AuthRequest } from '../common/types.js';
import { ConversationRecord, database, nextId } from '../database/database.js';
import { sendError } from '../common/api-error.js';

export const conversationRouter = Router();

conversationRouter.get('/', requireAuth(['admin']), (_request, response) => {
  const rows = database.data.conversations
    .map((conversation) => {
      const user = database.data.users.find((item) => item.id === conversation.userId);
      return {
        ...conversation,
        userFullName: user?.fullName ?? 'کاربر حذف‌شده',
        username: user?.username ?? '-'
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  response.json(rows);
});

conversationRouter.post('/', requireAuth(), async (request: AuthRequest, response) => {
  const result = z
    .object({
      question: z.string().trim().min(1),
      answer: z.string().trim().min(1),
      matchedFaqId: z.number().int().positive().nullable().optional()
    })
    .safeParse(request.body);
  if (!result.success || !request.user) {
    sendError(response, 400, 'CONVERSATION_INVALID', 'اطلاعات گفتگو معتبر نیست.');
    return;
  }
  if (result.data.matchedFaqId && !database.data.faqs.some((faq) => faq.id === result.data.matchedFaqId)) {
    sendError(response, 400, 'MATCHED_FAQ_INVALID', 'FAQ مرتبط وجود ندارد یا حذف شده است.');
    return;
  }
  const conversation: ConversationRecord = {
    id: nextId(database.data.conversations),
    userId: request.user.id,
    question: result.data.question,
    answer: result.data.answer,
    matchedFaqId: result.data.matchedFaqId ?? null,
    createdAt: new Date().toISOString()
  };
  database.data.conversations.push(conversation);
  await database.write();
  response.status(201).json(conversation);
});
