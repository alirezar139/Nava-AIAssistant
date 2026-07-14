import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/auth.middleware.js';
import { faqRepository } from '../database/repositories.js';
import { sendError } from '../common/api-error.js';

const faqSchema = z.object({
  question: z.string().trim().min(1),
  answer: z.string().trim().min(1),
  category: z.string().trim().default(''),
  keywords: z.string().trim().default('')
});

export const faqRouter = Router();

faqRouter.get('/', requireAuth(), (_request, response) => {
  response.json(faqRepository.list());
});

faqRouter.post('/', requireAuth(['admin']), async (request, response) => {
  const result = faqSchema.safeParse(request.body);
  if (!result.success) {
    sendError(response, 400, 'FAQ_INVALID', 'سؤال و پاسخ معتبر وارد کنید.');
    return;
  }
  const faq = await faqRepository.create(result.data);
  response.status(201).json(faq);
});

faqRouter.post('/import', requireAuth(['admin']), async (request, response) => {
  const result = z.array(faqSchema).min(1).safeParse(request.body);
  if (!result.success) {
    sendError(response, 400, 'FAQ_IMPORT_INVALID', 'ساختار اطلاعات FAQ معتبر نیست.');
    return;
  }
  const count = await faqRepository.replaceAll(result.data);
  response.json({ count });
});

faqRouter.post('/bulk-delete', requireAuth(['admin']), async (request, response) => {
  const result = z.object({ ids: z.array(z.number().int().positive()).min(1) }).safeParse(request.body);
  if (!result.success) {
    sendError(response, 400, 'FAQ_BULK_DELETE_INVALID', 'شناسه‌های FAQ برای حذف معتبر نیستند.');
    return;
  }

  const count = await faqRepository.deleteMany(result.data.ids);
  response.json({ count });
});

faqRouter.put('/:id', requireAuth(['admin']), async (request, response) => {
  const result = faqSchema.safeParse(request.body);
  const id = Number(request.params['id']);
  if (!faqRepository.exists(id)) {
    sendError(response, 404, 'FAQ_NOT_FOUND', 'FAQ موردنظر پیدا نشد.');
    return;
  }
  if (!result.success) {
    sendError(response, 400, 'FAQ_INVALID', 'اطلاعات FAQ معتبر نیست.');
    return;
  }
  const faq = await faqRepository.update(id, result.data);
  response.json(faq);
});

faqRouter.delete('/:id', requireAuth(['admin']), async (request, response) => {
  const deleted = await faqRepository.delete(Number(request.params['id']));
  if (!deleted) {
    sendError(response, 404, 'FAQ_NOT_FOUND', 'FAQ موردنظر پیدا نشد.');
    return;
  }
  response.status(204).send();
});
