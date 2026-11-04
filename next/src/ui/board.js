/* Canvas 棋盘：绘制与点击命中（ui 层，不含规则） */
(function (root) {
  'use strict';
  const GVR = root.GVR || (root.GVR = {});

  class BoardView {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.engine = null;
      this.opts = { interactive: false, coords: false, turn: 0, selected: null, moveMode: null };
      this.hover = null;
      this.side = 0;
      this.pad = 0;
      this.cell = 0;
      this.onCell = null;
    }

    attach(onCell) {
      this.onCell = onCell;
      this.canvas.addEventListener('mousemove', (e) => {
        const c = this.hitTest(e);
        const changed = (c && !this.hover) || (!c && this.hover) ||
          (c && this.hover && (c.x !== this.hover.x || c.y !== this.hover.y));
        if (changed) { this.hover = c; this.draw(); }
      });
      this.canvas.addEventListener('mouseleave', () => { this.hover = null; this.draw(); });
      this.canvas.addEventListener('click', (e) => {
        const c = this.hitTest(e);
        if (c && this.onCell) this.onCell(c.x, c.y);
      });
      this.canvas.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        if (!t) return;
        const c = this.hitTest({ clientX: t.clientX, clientY: t.clientY });
        if (c && this.onCell) { e.preventDefault(); this.onCell(c.x, c.y); }
      }, { passive: false });
    }

    render(engine, opts) {
      this.engine = engine;
      this.opts = Object.assign({ interactive: false, coords: false, turn: 0, selected: null, moveMode: null }, opts || {});
      this.resize();
    }

    resize() {
      const state = this.engine && this.engine.state;
      if (!state) return;
      const parent = this.canvas.parentElement;
      const availW = parent ? parent.clientWidth : 420;
      const side = Math.max(300, Math.min(availW || 420, window.innerHeight - 260, 680));
      const dpr = window.devicePixelRatio || 1;
      this.canvas.style.width = this.canvas.style.height = side + 'px';
      this.canvas.width = this.canvas.height = Math.round(side * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.side = side;
      this.pad = Math.round(side * 0.07);
      this.cell = (side - this.pad * 2) / (state.size - 1);
      this.draw();
    }

    xy(x, y) {
      return [this.pad + x * this.cell, this.pad + y * this.cell];
    }

    hitTest(e) {
      const state = this.engine && this.engine.state;
      if (!state) return null;
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      const x = Math.round((px - this.pad) / this.cell);
      const y = Math.round((py - this.pad) / this.cell);
      if (x < 0 || y < 0 || x >= state.size || y >= state.size) return null;
      const [cx, cy] = this.xy(x, y);
      if (Math.hypot(px - cx, py - cy) > this.cell * 0.52) return null;
      return { x, y };
    }

    draw() {
      const ctx = this.ctx;
      const state = this.engine && this.engine.state;
      const size = state ? state.size : 15;
      const side = this.side;
      if (!side) return;

      const bg = ctx.createLinearGradient(0, 0, side, side);
      bg.addColorStop(0, '#e3b877');
      bg.addColorStop(0.5, '#d8a962');
      bg.addColorStop(1, '#c99a55');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, side, side);

      ctx.strokeStyle = 'rgba(110,80,42,.85)';
      ctx.lineWidth = 1;
      for (let i = 0; i < size; i++) {
        const [x1, y1] = this.xy(0, i);
        const [x2] = this.xy(size - 1, i);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y1); ctx.stroke();
        const [ax, ay] = this.xy(i, 0);
        const [, by] = this.xy(i, size - 1);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax, by); ctx.stroke();
      }

      ctx.fillStyle = 'rgba(96,68,34,.9)';
      for (const [sx, sy] of stars(size)) {
        const [cx, cy] = this.xy(sx, sy);
        ctx.beginPath(); ctx.arc(cx, cy, Math.max(2, this.cell * 0.1), 0, Math.PI * 2); ctx.fill();
      }

      if (this.opts.coords) {
        ctx.fillStyle = 'rgba(78,54,26,.9)';
        ctx.font = Math.max(9, Math.round(this.cell * 0.34)) + 'px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < size; i++) {
          const [cx, cy] = this.xy(i, 0);
          ctx.fillText(String.fromCharCode(65 + i), cx, cy - this.cell * 0.72);
          const [lx, ly] = this.xy(0, i);
          ctx.fillText(String(i + 1), lx - this.cell * 0.72, ly);
        }
      }

      if (!state) return;

      const moveMode = this.opts.moveMode;
      const canPlay = this.opts.interactive && !state.ended && !moveMode && this.opts.turn === state.turn;
      if (canPlay && this.hover && state.board[this.hover.y][this.hover.x] === 0) {
        const [cx, cy] = this.xy(this.hover.x, this.hover.y);
        ctx.globalAlpha = 0.45;
        this.stone(cx, cy, state.turn);
        ctx.globalAlpha = 1;
      }

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (state.board[y][x] !== 0) {
            const [cx, cy] = this.xy(x, y);
            this.stone(cx, cy, state.board[y][x]);
          }
        }
      }

      if (moveMode && moveMode.from) {
        const [cx, cy] = this.xy(moveMode.from[0], moveMode.from[1]);
        ctx.strokeStyle = '#2f7fd0';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, this.cell * 0.30, 0, Math.PI * 2); ctx.stroke();
      } else if (moveMode && this.hover && state.board[this.hover.y][this.hover.x] !== 0) {
        const [cx, cy] = this.xy(this.hover.x, this.hover.y);
        ctx.strokeStyle = 'rgba(47,127,208,.75)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, this.cell * 0.30, 0, Math.PI * 2); ctx.stroke();
      }

      if (this.opts.selected) {
        const [cx, cy] = this.xy(this.opts.selected[0], this.opts.selected[1]);
        ctx.strokeStyle = 'rgba(226,169,92,.95)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, this.cell * 0.34, 0, Math.PI * 2); ctx.stroke();
      }

      if (state.lastMove) {
        const [cx, cy] = this.xy(state.lastMove.x, state.lastMove.y);
        ctx.strokeStyle = '#c9432f';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, this.cell * 0.17, 0, Math.PI * 2); ctx.stroke();
      }

      if (state.winLine && state.winLine.length) {
        ctx.strokeStyle = 'rgba(201,67,47,.85)';
        ctx.lineWidth = 4;
        const a = state.winLine[0], b = state.winLine[state.winLine.length - 1];
        const [ax, ay] = this.xy(a[0], a[1]);
        const [bx, by] = this.xy(b[0], b[1]);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      }
    }

    stone(cx, cy, color) {
      const ctx = this.ctx;
      const r = this.cell * 0.44;
      const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.12, cx, cy, r);
      if (color === 1) { g.addColorStop(0, '#6b6b6b'); g.addColorStop(1, '#0b0b0b'); }
      else { g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#c8c2b4'); }
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = color === 1 ? 'rgba(255,255,255,.08)' : 'rgba(90,80,60,.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function stars(size) {
    if (size === 15) return [[3, 3], [11, 3], [3, 11], [11, 11], [7, 7]];
    if (size === 19) return [[3, 3], [9, 3], [15, 3], [3, 9], [9, 9], [15, 9], [3, 15], [9, 15], [15, 15]];
    const c = Math.floor(size / 2);
    return [[c, c]];
  }

  GVR.BoardView = BoardView;
})(typeof window !== 'undefined' ? window : globalThis);
