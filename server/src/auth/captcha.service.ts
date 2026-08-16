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
    const palette = ['#0e5647', '#176454', '#1f8a72', '#0b3f34', '#12786a'];
    const letters = [...answer]
      .map((character, index) => {
        const x = 24 + index * 27;
        const y = 40 + randomInt(-3, 4);
        const rotation = randomInt(-16, 17);
        const color = palette[randomInt(palette.length)];
        const delay = (index * 0.14).toFixed(2);
        return `<text x="${x}" y="${y}" fill="${color}" transform="rotate(${rotation} ${x} ${y})" style="animation-delay:${delay}s" class="ch">${character}</text>`;
      })
      .join('');
    const dots = Array.from({ length: 16 }, (_, index) => {
      const cx = randomInt(6, 164);
      const cy = randomInt(6, 54);
      const r = 1 + randomInt(0, 3) / 2;
      const delay = (Math.random() * 3).toFixed(2);
      return `<circle cx="${cx}" cy="${cy}" r="${r}" style="animation-delay:${delay}s" class="dot" />`;
    }).join('');
    const waveDelay = (Math.random() * 1.5).toFixed(2);

    return `<svg xmlns="http://www.w3.org/2000/svg" width="170" height="60" viewBox="0 0 170 60">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#eaf5f0"><animate attributeName="stop-color" values="#eaf5f0;#dcf0e6;#eaf5f0" dur="5s" repeatCount="indefinite" /></stop>
          <stop offset="100%" stop-color="#dbeee7"><animate attributeName="stop-color" values="#dbeee7;#cfe8de;#dbeee7" dur="5s" repeatCount="indefinite" /></stop>
        </linearGradient>
        <style>
          .ch { font-family: 'Segoe UI', Tahoma, sans-serif; font-size: 26px; font-weight: 800; animation: bob 2.4s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
          @keyframes bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
          .dot { fill: #7fb8a5; opacity: .35; animation: twinkle 3s ease-in-out infinite; }
          @keyframes twinkle { 0%,100% { opacity: .12; } 50% { opacity: .5; } }
          .wave { stroke: #9fd2bf; stroke-width: 1.4; fill: none; opacity: .5; stroke-dasharray: 6 5; animation: dash 3.5s linear infinite; animation-delay: ${waveDelay}s; }
          @keyframes dash { to { stroke-dashoffset: -22; } }
        </style>
      </defs>
      <rect width="170" height="60" rx="14" fill="url(#bg)" />
      <rect x="1" y="1" width="168" height="58" rx="13" fill="none" stroke="#bfe1d3" stroke-width="1" />
      <path class="wave" d="M0 46 Q 21 38 42 46 T 84 46 T 126 46 T 170 46" />
      <path class="wave" d="M0 16 Q 21 24 42 16 T 84 16 T 126 16 T 170 16" style="animation-delay:${(Number(waveDelay) + 0.6).toFixed(2)}s" />
      <g>${dots}</g>
      <g>${letters}</g>
    </svg>`;
  }

  private removeExpired(): void {
    const now = Date.now();
    for (const [token, challenge] of this.challenges) {
      if (challenge.expiresAt < now) this.challenges.delete(token);
    }
  }
}

export const captchaService = new CaptchaService();
