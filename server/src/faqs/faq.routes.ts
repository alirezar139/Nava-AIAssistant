import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/auth.middleware.js';
import { database, FaqRecord, nextId } from '../database/database.js';
import { sendError } from '../common/api-error.js';

const faqSchema = z.object({
  question: z.string().trim().min(1),
  answer: z.string().trim().min(1),
  category: z.string().trim().default(''),
  keywords: z.string().trim().default('')
});

export const faqRouter = Router();

faqRouter.get('/', requireAuth(), (_request, response) => {
  response.json([...database.data.faqs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
});

faqRouter.post('/', requireAuth(['admin']), async (request, response) => {
  const result = faqSchema.safeParse(request.body);
  if (!result.success) {
    sendError(response, 400, 'FAQ_INVALID', 'سؤال و پاسخ معتبر وارد کنید.');
    return;
  }
  const faq: FaqRecord = {
    id: nextId(database.data.faqs),
    ...result.data,
    updatedAt: new Date().toISOString()
  };
  database.data.faqs.push(faq);
  await database.write();
  response.status(201).json(faq);
});

faqRouter.post('/import', requireAuth(['admin']), async (request, response) => {
  const result = z.array(faqSchema).min(1).safeParse(request.body);
  if (!result.success) {
    sendError(response, 400, 'FAQ_IMPORT_INVALID', 'ساختار اطلاعات FAQ معتبر نیست.');
    return;
  }
  const timestamp = new Date().toISOString();
  database.data.faqs = result.data.map((faq, index) => ({ id: index + 1, ...faq, updatedAt: timestamp }));
  await database.write();
  response.json({ count: result.data.length });
});

faqRouter.post('/bulk-delete', requireAuth(['admin']), async (request, response) => {
  const result = z.object({ ids: z.array(z.number().int().positive()).min(1) }).safeParse(request.body);
  if (!result.success) {
    sendError(response, 400, 'FAQ_BULK_DELETE_INVALID', 'شناسه‌های FAQ برای حذف معتبر نیستند.');
    return;
  }

  const ids = new Set(result.data.ids);
  const previousCount = database.data.faqs.length;
  database.data.faqs = database.data.faqs.filter((faq) => !ids.has(faq.id));
  await database.write();
  response.json({ count: previousCount - database.data.faqs.length });
});

faqRouter.put('/:id', requireAuth(['admin']), async (request, response) => {
  const result = faqSchema.safeParse(request.body);
  const faq = database.data.faqs.find((item) => item.id === Number(request.params['id']));
  if (!faq) {
    sendError(response, 404, 'FAQ_NOT_FOUND', 'FAQ موردنظر پیدا نشد.');
    return;
  }
  if (!result.success) {
    sendError(response, 400, 'FAQ_INVALID', 'اطلاعات FAQ معتبر نیست.');
    return;
  }
  Object.assign(faq, result.data, { updatedAt: new Date().toISOString() });
  await database.write();
  response.json(faq);
});

faqRouter.delete('/:id', requireAuth(['admin']), async (request, response) => {
  const faq = database.data.faqs.find((item) => item.id === Number(request.params['id']));
  if (!faq) {
    sendError(response, 404, 'FAQ_NOT_FOUND', 'FAQ موردنظر پیدا نشد.');
    return;
  }
  database.data.faqs = database.data.faqs.filter((faq) => faq.id !== Number(request.params['id']));
  await database.write();
  response.status(204).send();
});
