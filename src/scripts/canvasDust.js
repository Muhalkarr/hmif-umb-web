/* ==========================================================================
   HMIF UMB CANVAS DUST ENGINE
   ========================================================================== */

import { DUST_PERCENT_MAX } from '../../shared/siteSchema.js';

class DustParticle {
  constructor(x, y) {
    this.x = x ?? Math.random() * window.innerWidth;
    this.y = y ?? Math.random() * window.innerHeight;
    this.vx = Math.random() * 0.6 + 0.3;
    this.vy = Math.random() * 0.4 + 0.1;
    this.shadowBlur = Math.random() * 4 + 1;
    this.shadowX = Math.random() * 2 - 1;
    this.shadowY = Math.random() * 2 - 1;
    this.radiusX = Math.random() * 1.6 + 0.6;
    this.radiusY = this.radiusX * (Math.random() * 0.8 + 0.4);
    this.rotation = Math.PI * Math.random();
    this.alpha = Math.random() * 0.5 + 0.2;
  }
}

export class CanvasDustEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.dustQuantity = 45;
    this.dustArr = [];
    this.isRunning = false;
    this.isLightTheme = false;
    this.color = '0, 229, 255';
    this.alphaMultiplier = 1;
    this.shadowAlpha = 0.6;
    this.shadowBlurMultiplier = 1;
    this.density = 100;
    this.opacity = 100;
    this.bindEvents();
    this.build();
  }

  setTheme(appearance, motionEnabled = true, dustSettings = {}) {
    this.isLightTheme = appearance === 'light';
    this.color = this.isLightTheme ? '17, 19, 21' : '0, 229, 255';
    const density = Number(dustSettings.density);
    const opacity = Number(dustSettings.opacity);
    this.density = Math.max(10, Math.min(DUST_PERCENT_MAX, Number.isFinite(density) ? density : 100));
    this.opacity = Math.max(10, Math.min(DUST_PERCENT_MAX, Number.isFinite(opacity) ? opacity : 100));
    this.alphaMultiplier = (this.isLightTheme ? 0.72 : 1) * (this.opacity / 100);
    this.shadowAlpha = (this.isLightTheme ? 0.14 : 0.6) * (this.opacity / 100);
    this.shadowBlurMultiplier = this.isLightTheme ? 0.45 : 1;
    this.syncParticleCount();
    const shouldAnimate = motionEnabled && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (shouldAnimate) this.start();
    else this.stop();
  }

  bindEvents() {
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    if (!this.canvas) return;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.baseDustQuantity = Math.min(65, Math.floor((this.width + this.height) / 45));
    this.syncParticleCount();
  }

  syncParticleCount() {
    if (!this.dustArr) return;
    this.dustQuantity = Math.max(8, Math.round((this.baseDustQuantity || 45) * this.density / 100));
    this.dustArr.length = Math.min(this.dustArr.length, this.dustQuantity);
    while (this.dustArr.length < this.dustQuantity) this.dustArr.push(new DustParticle());
  }

  build() {
    this.resize();
    this.dustArr = [];
    for (let i = 0; i < this.dustQuantity; i++) {
      this.dustArr.push(new DustParticle());
    }
    this.start();
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.animate();
  }

  stop() {
    this.isRunning = false;
    this.ctx?.clearRect(0, 0, this.width, this.height);
  }

  animate = () => {
    if (!this.isRunning || !this.ctx) return;
    this.ctx.clearRect(0, 0, this.width, this.height);

    for (const dust of this.dustArr) {
      dust.x -= dust.vx;
      dust.y -= dust.vy;

      if (dust.x < -10 || dust.y < -10) {
        dust.x = this.width + 10;
        dust.y = Math.random() * this.height;
      }

      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.fillStyle = `rgba(${this.color}, ${Math.min(1, dust.alpha * this.alphaMultiplier)})`;
      this.ctx.shadowColor = `rgba(${this.color}, ${Math.min(1, this.shadowAlpha)})`;
      this.ctx.shadowBlur = dust.shadowBlur * this.shadowBlurMultiplier;
      this.ctx.shadowOffsetX = dust.shadowX;
      this.ctx.shadowOffsetY = dust.shadowY;

      this.ctx.ellipse(
        dust.x,
        dust.y,
        dust.radiusX,
        dust.radiusY,
        dust.rotation,
        0,
        Math.PI * 2
      );
      this.ctx.fill();
      this.ctx.restore();
    }

    requestAnimationFrame(this.animate);
  };
}
