import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/auth.middleware.js';
import { AuthRequest } from '../common/types.js';
import { conversationRepository, faqRepository } from '../database/repositories.js';
import { sendError } from '../common/api-error.js';

export const conversationRouter = Router();

conversationRouter.get('/', requireAuth(['admin']), (_request, response) => {
  response.json(conversationRepository.listWithUsers());
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
  if (result.data.matchedFaqId && !faqRepository.exists(result.data.matchedFaqId)) {
    sendError(response, 400, 'MATCHED_FAQ_INVALID', 'FAQ مرتبط وجود ندارد یا حذف شده است.');
    return;
  }
  const conversation = await conversationRepository.create({
    userId: request.user.id,
    question: result.data.question,
    answer: result.data.answer,
    matchedFaqId: result.data.matchedFaqId ?? null
  });
  response.status(201).json(conversation);
});
