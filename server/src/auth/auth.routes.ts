import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { database } from '../database/database.js';
import { AuthUser } from '../common/types.js';
import { signToken } from './auth.middleware.js';
import { captchaService } from './captcha.service.js';
import { sendError } from '../common/api-error.js';

export const authRouter = Router();

authRouter.get('/captcha', (_request, response) => {
  response.json(captchaService.create());
});

authRouter.post('/login', (request, response) => {
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

  const row = database.data.users.find((user) => user.username === result.data.username);

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
