/* ==========================================================================
   HMIF UMB CANVAS DUST ENGINE
   ========================================================================== */

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
    this.color = '#00e5ff';
    this.bindEvents();
    this.build();
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
    this.dustQuantity = Math.min(65, Math.floor((this.width + this.height) / 45));
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
      this.ctx.fillStyle = `rgba(0, 229, 255, ${dust.alpha})`;
      this.ctx.shadowColor = 'rgba(0, 229, 255, 0.6)';
      this.ctx.shadowBlur = dust.shadowBlur;
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
