/* 连珠：落子后形成 n 连珠即获胜（n / 方向 / 至少-恰好可配，归属方可选黑/白/双方） */
(function (root) {
  'use strict';
  const GVR = root.GVR || (root.GVR = {});
  const B = GVR.Board;

  GVR.registerMod({
    id: 'chain',
    label: '连珠',
    group: '落子规则',
    summary: '落子后形成 n 连珠触发获胜；可限定横竖或斜线，并可只对某一方生效。',
    order: 10,
    scope: 'side',
    defaults: { enabled: true, owner: 'both' },
    params: [
      { key: 'n', label: '连珠数 n', type: 'number', min: 2, max: 12, default: 5 },
      { key: 'dirs', label: '允许方向', type: 'select', default: 'all',
        options: [{ value: 'all', label: '横竖斜' }, { value: 'line', label: '仅横竖' }, { value: 'diag', label: '仅斜线' }] },
      { key: 'mode', label: '判定', type: 'select', default: 'atLeast',
        options: [{ value: 'atLeast', label: '至少' }, { value: 'exact', label: '恰好' }] }
    ],

    afterPlace(ctx) {
      const cfg = ctx.cfg;
      const side = ctx.engine.sideVars(ctx.color);
      const info = B.chainInfo(ctx.state.board, ctx.state.size, ctx.x, ctx.y, ctx.color,
        Number(cfg.n) || 5, cfg.dirs, cfg.mode);
      side.chainLen = info.ok ? info.length : 0;
    },

    checkWin(ctx) {
      const cfg = ctx.cfg;
      const info = B.chainInfo(ctx.state.board, ctx.state.size, ctx.x, ctx.y, ctx.color,
        Number(cfg.n) || 5, cfg.dirs, cfg.mode);
      if (!info.ok) return null;
      return {
        winner: ctx.color,
        reason: info.length + ' 连珠（n=' + (Number(cfg.n) || 5) + '）',
        cells: info.cells
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
