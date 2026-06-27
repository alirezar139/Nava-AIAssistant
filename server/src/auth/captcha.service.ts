import { randomInt, randomUUID } from 'node:crypto';

interface StoredCaptcha {
  answer: string;
  expiresAt: number;
}

export interface CaptchaPayload {
  token: string;
  image: string;
}

export class CaptchaService {
  private readonly challenges = new Map<string, StoredCaptcha>();
  private readonly characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  private readonly lifetimeMs = 2 * 60 * 1000;

  create(): CaptchaPayload {
    this.removeExpired();
    const token = randomUUID();
    const answer = Array.from({ length: 5 }, () => this.characters[randomInt(this.characters.length)]).join(
      ''
    );
    this.challenges.set(token, { answer, expiresAt: Date.now() + this.lifetimeMs });

    return {
      token,
      image: `data:image/svg+xml;base64,${Buffer.from(this.createSvg(answer)).toString('base64')}`
    };
  }

  verify(token: string, answer: string): boolean {
    const challenge = this.challenges.get(token);
    this.challenges.delete(token);
    return Boolean(
      challenge && challenge.expiresAt >= Date.now() && challenge.answer === answer.trim().toUpperCase()
    );
  }

  private createSvg(answer: string): string {
    const letters = [...answer]
      .map((character, index) => {
        const x = 25 + index * 27;
        const y = 40 + randomInt(-4, 5);
        const rotation = randomInt(-18, 19);
        return `<text x="${x}" y="${y}" transform="rotate(${rotation} ${x} ${y})">${character}</text>`;
      })
      .join('');
    const lines = Array.from(
      { length: 5 },
      () =>
        `<line x1="${randomInt(0, 70)}" y1="${randomInt(8, 55)}" x2="${randomInt(90, 170)}" y2="${randomInt(8, 55)}" />`
    ).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="170" height="60" viewBox="0 0 170 60"><rect width="170" height="60" rx="12" fill="#edf3ef"/><g stroke="#8eaaa1" stroke-width="1" opacity=".55">${lines}</g><g fill="#174b40" font-family="monospace" font-size="25" font-weight="700">${letters}</g></svg>`;
  }

  private removeExpired(): void {
    const now = Date.now();
    for (const [token, challenge] of this.challenges) {
      if (challenge.expiresAt < now) this.challenges.delete(token);
    }
  }
}

export const captchaService = new CaptchaService();
