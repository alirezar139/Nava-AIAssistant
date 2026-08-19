import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { userRepository } from '../database/repositories.js';
import { AuthUser } from '../common/types.js';
import { signToken } from './auth.middleware.js';
import { captchaService } from './captcha.service.js';
import { createRateLimiter } from './rate-limit.middleware.js';
import { sendError } from '../common/api-error.js';

export const authRouter = Router();

const captchaLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  code: 'CAPTCHA_RATE_LIMITED',
  message: 'درخواست کد امنیتی بیش از حد مجاز است. کمی صبر کنید.'
});

const loginLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 10,
  code: 'LOGIN_RATE_LIMITED',
  message: 'تعداد تلاش برای ورود بیش از حد مجاز است. کمی صبر کنید.'
});

authRouter.get('/captcha', captchaLimiter, (_request, response) => {
  response.json(captchaService.create());
});

authRouter.post('/login', loginLimiter, async (request, response) => {
  const result = z
    .object({
      username: z.string().min(1),
      password: z.string().min(1),
      captchaToken: z.string().uuid(),
      captchaAnswer: z.string().trim().min(1)
    })
    .safeParse(request.body);
  if (!result.success) {
    sendError(response, 400, 'LOGIN_FIELDS_REQUIRED', 'نام کاربری، رمز عبور و کد امنیتی را کامل کنید.');
    return;
  }

  if (!captchaService.verify(result.data.captchaToken, result.data.captchaAnswer)) {
    sendError(response, 400, 'CAPTCHA_INVALID', 'کد امنیتی صحیح نیست یا منقضی شده است.');
    return;
  }

  const row = await userRepository.findByUsername(result.data.username);

  if (!row || !bcrypt.compareSync(result.data.password, row.passwordHash)) {
    sendError(response, 401, 'CREDENTIALS_INVALID', 'نام کاربری یا رمز عبور صحیح نیست.');
    return;
  }

  const user: AuthUser = {
    id: row.id,
    username: row.username,
    fullName: row.fullName,
    role: row.role
  };
  response.json({ token: signToken(user), user });
});
