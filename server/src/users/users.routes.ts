import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { requireAuth } from '../auth/auth.middleware.js';
import { sendError } from '../common/api-error.js';
import { AuthRequest } from '../common/types.js';
import { UserRecord } from '../database/domain-types.js';
import { userRepository } from '../database/repositories.js';

export const usersRouter = Router();

const userRoles = ['admin', 'user', 'developer'] as const;

const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[a-zA-Z0-9_.-]+$/),
  password: z.string().min(6).max(200),
  fullName: z.string().trim().min(2).max(150),
  role: z.enum(userRoles)
});

const updateUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[a-zA-Z0-9_.-]+$/),
  password: z.string().min(6).max(200).optional(),
  fullName: z.string().trim().min(2).max(150),
  role: z.enum(userRoles)
});

function toPublicUser(user: UserRecord): Omit<UserRecord, 'passwordHash'> {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    createdAt: user.createdAt
  };
}

usersRouter.get('/', requireAuth(['admin', 'developer']), async (_request, response) => {
  const users = await userRepository.list();
  response.json(users.map(toPublicUser));
});

usersRouter.post('/', requireAuth(['admin', 'developer']), async (request, response) => {
  const result = createUserSchema.safeParse(request.body);
  if (!result.success) {
    sendError(response, 400, 'USER_INVALID', 'اطلاعات حساب کاربری معتبر نیست.');
    return;
  }

  if (await userRepository.usernameExists(result.data.username)) {
    sendError(response, 409, 'USERNAME_EXISTS', 'این نام کاربری قبلاً ثبت شده است.');
    return;
  }

  const created = await userRepository.create({
    username: result.data.username,
    passwordHash: bcrypt.hashSync(result.data.password, 10),
    fullName: result.data.fullName,
    role: result.data.role
  });
  response.status(201).json(toPublicUser(created));
});

usersRouter.put('/:id', requireAuth(['admin', 'developer']), async (request, response) => {
  const id = Number(request.params['id']);
  const existing = await userRepository.findById(id);
  if (!existing) {
    sendError(response, 404, 'USER_NOT_FOUND', 'کاربر پیدا نشد.');
    return;
  }

  const result = updateUserSchema.safeParse(request.body);
  if (!result.success) {
    sendError(response, 400, 'USER_INVALID', 'اطلاعات حساب کاربری معتبر نیست.');
    return;
  }

  if (await userRepository.usernameExists(result.data.username, id)) {
    sendError(response, 409, 'USERNAME_EXISTS', 'این نام کاربری قبلاً ثبت شده است.');
    return;
  }

  const updated = await userRepository.update(id, {
    username: result.data.username,
    fullName: result.data.fullName,
    role: result.data.role,
    passwordHash: result.data.password ? bcrypt.hashSync(result.data.password, 10) : undefined
  });
  response.json(toPublicUser(updated!));
});

usersRouter.delete('/:id', requireAuth(['admin', 'developer']), async (request: AuthRequest, response) => {
  const id = Number(request.params['id']);
  if (request.user?.id === id) {
    sendError(response, 400, 'CANNOT_DELETE_SELF', 'نمی‌توانید حساب کاربری خودتان را حذف کنید.');
    return;
  }

  const deleted = await userRepository.delete(id);
  if (!deleted) {
    sendError(response, 404, 'USER_NOT_FOUND', 'کاربر پیدا نشد.');
    return;
  }

  response.status(204).send();
});
