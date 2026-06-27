import { Response } from 'express';

export function sendError(response: Response, status: number, code: string, message: string): void {
  response.status(status).json({
    code,
    message,
    traceId: response.locals['traceId'] as string
  });
}
