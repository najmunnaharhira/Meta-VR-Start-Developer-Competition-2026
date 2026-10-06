/**
 * Small world-space text cards drawn to a canvas. Used for the step prompt
 * and the ray/poke buttons, so text stays crisp and fully under our control
 * (high-contrast mode just redraws with a different palette).
 */

import {
  CanvasTexture,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';

export interface CardStyle {
  background: string;
  foreground: string;
  accent: string;
  border: string;
}

export const NORMAL_STYLE: CardStyle = {
  background: 'rgba(20, 28, 24, 0.82)',
  foreground: '#f3f7f1',
  accent: '#9be37a',
  border: 'rgba(255,255,255,0.18)',
};

export const HIGH_CONTRAST_STYLE: CardStyle = {
  background: '#000000',
  foreground: '#ffffff',
  accent: '#ffe600',
  border: '#ffffff',
};

export class TextCard {
  readonly mesh: Mesh;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: CanvasTexture;
  private title = '';
  private body = '';
  private progress = -1;
  style: CardStyle = NORMAL_STYLE;
  highlighted = false;

  constructor(
    widthMeters: number,
    heightMeters: number,
    private pxPerMeter = 2400,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(widthMeters * pxPerMeter);
    this.canvas.height = Math.round(heightMeters * pxPerMeter);
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;
    const material = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      side: DoubleSide,
      depthWrite: false,
    });
    this.mesh = new Mesh(new PlaneGeometry(widthMeters, heightMeters), material);
    this.mesh.renderOrder = 10;
  }

  set(title: string, body = '', progress = -1): void {
    if (title === this.title && body === this.body && progress === this.progress) {
      return;
    }
    this.title = title;
    this.body = body;
    this.progress = progress;
    this.redraw();
  }

  redraw(): void {
    const { ctx, canvas, style } = this;
    const w = canvas.width;
    const h = canvas.height;
    const r = Math.min(h * 0.22, 48);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = this.highlighted ? style.accent : style.background;
    roundRect(ctx, 3, 3, w - 6, h - 6, r);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = style.border;
    ctx.stroke();

    const fg = this.highlighted ? style.background : style.foreground;
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const hasBody = this.body.length > 0;
    const titleSize = Math.round(h * (hasBody ? 0.19 : 0.42));
    ctx.font = `700 ${titleSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
    ctx.fillText(this.title, w / 2, hasBody ? h * 0.2 : h / 2, w * 0.92);
    if (hasBody) {
      const bodySize = Math.round(h * 0.12);
      ctx.font = `500 ${bodySize}px system-ui, -apple-system, Segoe UI, sans-serif`;
      ctx.fillStyle = this.highlighted ? style.background : style.foreground;
      wrapText(ctx, this.body, w / 2, h * 0.43, w * 0.88, bodySize * 1.2);
    }
    if (this.progress >= 0) {
      const barW = w * 0.7;
      const barH = h * 0.06;
      const x = (w - barW) / 2;
      const y = h * 0.84;
      ctx.fillStyle = style.border;
      roundRect(ctx, x, y, barW, barH, barH / 2);
      ctx.fill();
      ctx.fillStyle = style.accent;
      roundRect(ctx, x, y, Math.max(barH, barW * Math.min(1, this.progress)), barH, barH / 2);
      ctx.fill();
    }
    this.texture.needsUpdate = true;
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  lines.slice(0, 3).forEach((l, i) => ctx.fillText(l, cx, y + i * lineHeight));
}
