function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function mul(a, k) { return { x: a.x * k, y: a.y * k, z: a.z * k }; }
function cross(a, b) { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }
function rotate(v, axis, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  if (axis === 'x') return { x: v.x, y: v.y * c - v.z * s, z: v.y * s + v.z * c };
  if (axis === 'y') return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c };
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c, z: v.z };
}

export class CubeRenderer {
  constructor(canvas, cube, getSettings) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.cube = cube;
    this.getSettings = getSettings;
    this.width = 1; this.height = 1; this.dpr = 1;
    this.yaw = 0.57; this.pitch = 0.48;
    this.animation = null;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    this.resize();
  }

  setCube(cube) { this.cube = cube; this.draw(); }
  setAnimation(move, progress) { this.animation = move ? { move, progress } : null; this.draw(); }
  resetCamera() { this.yaw = 0.57; this.pitch = 0.48; this.draw(); }
  rotateCamera(dx, dy) {
    this.yaw += dx * 0.008;
    this.pitch = Math.max(-0.05, Math.min(1.15, this.pitch + dy * 0.008));
    this.draw();
  }
  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.draw();
  }

  cameraVectors() {
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    return {
      right: { x: cy, y: 0, z: -sy },
      up: { x: -sy * sp, y: cp, z: -cy * sp },
      view: { x: sy * cp, y: sp, z: cy * cp }
    };
  }

  project(point, vectors, scale) {
    const x = dot(point, vectors.right);
    const y = -dot(point, vectors.up);
    const depth = dot(point, vectors.view);
    return { x: this.width / 2 + x * scale, y: this.height * 0.51 + y * scale, depth };
  }

  drawRoundedPolygon(points, color, radius, lineWidth) {
    const ctx = this.ctx;
    if (!points.length) return;
    if (radius <= 0.01) {
      ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.closePath();
    } else {
      const starts = [], ends = [];
      for (let i = 0; i < points.length; i++) {
        const prev = points[(i + points.length - 1) % points.length];
        const current = points[i];
        const next = points[(i + 1) % points.length];
        const cut = Math.min(radius, 0.38);
        starts.push({ x: current.x + (prev.x - current.x) * cut, y: current.y + (prev.y - current.y) * cut });
        ends.push({ x: current.x + (next.x - current.x) * cut, y: current.y + (next.y - current.y) * cut });
      }
      ctx.beginPath(); ctx.moveTo(starts[0].x, starts[0].y);
      for (let i = 0; i < points.length; i++) {
        ctx.quadraticCurveTo(points[i].x, points[i].y, ends[i].x, ends[i].y);
        const nextIndex = (i + 1) % points.length;
        ctx.lineTo(starts[nextIndex].x, starts[nextIndex].y);
      }
      ctx.closePath();
    }
    ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = lineWidth; ctx.strokeStyle = '#111711'; ctx.stroke();
    ctx.lineWidth = Math.max(0.45, lineWidth * 0.28); ctx.strokeStyle = '#ffffff17'; ctx.stroke();
  }

  draw() {
    if (!this.ctx || !this.width || !this.height) return;
    const ctx = this.ctx;
    const settings = this.getSettings();
    const colors = settings.colors;
    const n = this.cube.size;
    const vectors = this.cameraVectors();
    const visible = [];
    const cam = vectors.view;
    const halfGap = Math.max(0.405, Math.min(0.49, 0.5 - (Number(settings.gap) || 8) / 200));
    const roundness = Math.max(0, Math.min(0.38, (Number(settings.corner) || 0) / 100));
    const c = (n - 1) / 2;
    const scale = Math.min(this.width, this.height) * 0.455 / Math.max(1, n);
    const lineWidth = Math.max(0.65, Math.min(2.2, scale * 0.055));
    const maxDetailed = n >= 65 ? 38 : n >= 35 ? 52 : n;
    const stride = Math.max(1, Math.ceil(n / maxDetailed));

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    // A soft ground shadow gives the floating cube some depth.
    ctx.save();
    ctx.fillStyle = '#00000033'; ctx.filter = 'blur(14px)';
    ctx.beginPath(); ctx.ellipse(this.width / 2, this.height * 0.84, Math.min(this.width, this.height) * 0.24, Math.min(this.width, this.height) * 0.045, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    const anim = this.animation;
    const angle = anim ? (anim.move.quarterTurns * Math.PI / 2) * anim.progress : 0;
    for (const sticker of this.cube.stickers) {
      const normal = { x: sticker.nx, y: sticker.ny, z: sticker.nz };
      const moving = !!(anim && this.cube.isAffected(sticker, anim.move));
      const nrm = moving ? rotate(normal, anim.move.axis, angle) : normal;
      if (dot(nrm, cam) < 0.035) continue;
      if (stride > 1) {
        const axisList = sticker.nx ? ['y', 'z'] : sticker.ny ? ['x', 'z'] : ['x', 'y'];
        const a = Math.round(sticker[axisList[0]] + c);
        const b = Math.round(sticker[axisList[1]] + c);
        if (a % stride !== 0 || b % stride !== 0) continue;
      }
      const center = { x: sticker.x, y: sticker.y, z: sticker.z };
      const u = Math.abs(normal.y) > 0.8 ? { x: 1, y: 0, z: 0 } : Math.abs(normal.x) > 0.8 ? { x: 0, y: 0, z: normal.x > 0 ? -1 : 1 } : { x: 1, y: 0, z: 0 };
      let v = cross(normal, u);
      const vLength = Math.hypot(v.x, v.y, v.z) || 1; v = mul(v, 1 / vLength);
      const faceCenter = add(center, mul(normal, 0.505));
      const baseCorners = [
        add(add(faceCenter, mul(u, halfGap)), mul(v, halfGap)),
        add(add(faceCenter, mul(u, -halfGap)), mul(v, halfGap)),
        add(add(faceCenter, mul(u, -halfGap)), mul(v, -halfGap)),
        add(add(faceCenter, mul(u, halfGap)), mul(v, -halfGap))
      ];
      const corners3 = moving ? baseCorners.map(point => rotate(point, anim.move.axis, angle)) : baseCorners;
      const points = corners3.map(p => this.project(p, vectors, scale));
      const depth = points.reduce((sum, p) => sum + p.depth, 0) / points.length;
      visible.push({ points, depth, color: colors[sticker.face] || '#aaa' });
    }
    visible.sort((a, b) => a.depth - b.depth);
    for (const item of visible) this.drawRoundedPolygon(item.points, item.color, roundness, lineWidth);

    if (n >= 35) {
      ctx.save(); ctx.fillStyle = '#c4d1c633'; ctx.font = '9px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(`PERFORMANCE VIEW · ${n}×${n}`, this.width / 2, this.height - 15); ctx.restore();
    }
  }

  destroy() { this.resizeObserver?.disconnect(); }
}
