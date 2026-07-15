import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/auth.middleware.js';
import { AuthRequest } from '../common/types.js';
import { conversationRepository, faqRepository } from '../database/repositories.js';
import { sendError } from '../common/api-error.js';

export const conversationRouter = Router();

const conversationRatingSchema = z.object({
  rating: z.number().int().min(1).max(5)
});

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

conversationRouter.patch('/:id/rating', requireAuth(), async (request: AuthRequest, response) => {
  const id = Number(request.params['id']);
  const conversation = conversationRepository.findById(id);
  if (!conversation || (request.user?.role !== 'admin' && conversation.userId !== request.user?.id)) {
    sendError(response, 404, 'CONVERSATION_NOT_FOUND', 'گفت‌وگوی موردنظر پیدا نشد.');
    return;
  }

  const result = conversationRatingSchema.safeParse(request.body);
  if (!result.success) {
    sendError(response, 400, 'CONVERSATION_RATING_INVALID', 'امتیاز ثبت‌شده معتبر نیست.');
    return;
  }

  conversation.rating = result.data.rating;
  conversation.ratingSubmittedAt = new Date().toISOString();

  await conversationRepository.save();
  response.json(conversation);
});
