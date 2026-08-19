import { randomInt, randomUUID } from 'node:crypto';
import { Resvg } from '@resvg/resvg-js';

interface StoredCaptcha {
  answer: string;
  expiresAt: number;
  attempts: number;
}

export interface CaptchaPayload {
  token: string;
  image: string;
}

const MAX_VERIFY_ATTEMPTS = 5;

export class CaptchaService {
  private readonly challenges = new Map<string, StoredCaptcha>();
  private readonly characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  private readonly lifetimeMs = 2 * 60 * 1000;

  create(): CaptchaPayload {
    this.removeExpired();
    const token = randomUUID();
    const answer = Array.from({ length: 6 }, () => this.characters[randomInt(this.characters.length)]).join(
      ''
    );
    this.challenges.set(token, { answer, expiresAt: Date.now() + this.lifetimeMs, attempts: 0 });

    return {
      token,
      image: `data:image/png;base64,${this.rasterize(this.createSvg(answer)).toString('base64')}`
    };
  }

  verify(token: string, answer: string): boolean {
    const challenge = this.challenges.get(token);
    if (!challenge) return false;

    // Single-use token, but also cap repeated guesses against the same challenge
    // before it naturally expires, so a captured token can't be brute-forced.
    challenge.attempts += 1;
    if (challenge.attempts > MAX_VERIFY_ATTEMPTS || challenge.expiresAt < Date.now()) {
      this.challenges.delete(token);
      return false;
    }

    const isMatch = challenge.answer === answer.trim().toUpperCase();
    this.challenges.delete(token);
    return isMatch;
  }

  // The captcha is rasterized to a flat PNG so the answer never reaches the
  // client as selectable/parsable text: the SVG source (with the literal
  // characters as <text> nodes) never leaves the server, only pixels do.
  private rasterize(svg: string): Buffer {
    return new Resvg(svg, {
      font: { loadSystemFonts: true },
      fitTo: { mode: 'zoom', value: 2 }
    })
      .render()
      .asPng();
  }

  private createSvg(answer: string): string {
    const width = 200;
    const height = 64;
    const palette = ['#0e5647', '#176454', '#1f8a72', '#0b3f34', '#12786a', '#0a4a3d'];
    const ghostPalette = ['#a8d4c4', '#bcded2', '#c9e6da', '#9fcdba'];

    // Rasterized server-side, so the noise below is real anti-OCR signal
    // (not decoration): whatever a solver receives is only what a human eye
    // sees, there's no vector/text data to strip away underneath it.
    const letters = [...answer]
      .map((character, index) => {
        const x = 20 + index * 27 + randomInt(-4, 5);
        const y = 40 + randomInt(-5, 6);
        const rotation = randomInt(-28, 29);
        const skew = randomInt(-16, 17);
        const size = 22 + randomInt(0, 9);
        const color = palette[randomInt(palette.length)];
        return `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-family="'Segoe UI',Tahoma,sans-serif" font-weight="800" transform="rotate(${rotation} ${x} ${y}) skewX(${skew})">${character}</text>`;
      })
      .join('');

    // Decoy glyphs drawn from the same alphabet and weight as the real
    // characters, so a solver can't isolate the answer by color/opacity
    // thresholding alone.
    const ghosts = Array.from({ length: 7 }, () => {
      const gx = randomInt(6, width - 12);
      const gy = randomInt(14, height - 8);
      const grot = randomInt(-45, 46);
      const gchar = this.characters[randomInt(this.characters.length)];
      const gcolor = ghostPalette[randomInt(ghostPalette.length)];
      return `<text x="${gx}" y="${gy}" fill="${gcolor}" font-size="${18 + randomInt(0, 12)}" font-family="'Segoe UI',Tahoma,sans-serif" font-weight="700" transform="rotate(${grot} ${gx} ${gy})">${gchar}</text>`;
    }).join('');

    const dots = Array.from({ length: 34 }, () => {
      const cx = randomInt(6, width - 6);
      const cy = randomInt(6, height - 6);
      const r = 1 + randomInt(0, 3) / 2;
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#7fb8a5" opacity=".35" />`;
    }).join('');

    // scribble lines crossing straight through the letters, not just around them
    const scribbles = Array.from({ length: 5 }, () => {
      const y1 = randomInt(6, height - 6);
      const y2 = randomInt(6, height - 6);
      const yMid = randomInt(6, height - 6);
      return `<path d="M0 ${y1} Q ${width / 2} ${yMid} ${width} ${y2}" stroke="#6fae9a" stroke-width="1.1" fill="none" opacity=".4" />`;
    }).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#eaf5f0" />
          <stop offset="100%" stop-color="#dbeee7" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" rx="14" fill="url(#bg)" />
      <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="13" fill="none" stroke="#bfe1d3" stroke-width="1" />
      <path d="M0 50 Q ${width * 0.25} 40 ${width * 0.5} 50 T ${width} 50" stroke="#9fd2bf" stroke-width="1.4" fill="none" opacity=".5" />
      <path d="M0 16 Q ${width * 0.25} 26 ${width * 0.5} 16 T ${width} 16" stroke="#9fd2bf" stroke-width="1.4" fill="none" opacity=".5" />
      <g>${dots}</g>
      <g>${ghosts}</g>
      <g>${scribbles}</g>
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
