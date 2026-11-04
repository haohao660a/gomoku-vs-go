/* 获胜：胜负仲裁入口；支持提子目标数（配合围棋提子计数），并汇总其他规则提交的获胜提案 */
(function (root) {
  'use strict';
  const GVR = root.GVR || (root.GVR = {});
  const B = GVR.Board, State = GVR.State;

  GVR.registerMod({
    id: 'win',
    label: '获胜',
    group: '胜负规则',
    summary: '胜负仲裁：接收连珠等规则提交的获胜条件；也可按提子目标数判定。关闭后对局不会自动结束。',
    order: 90,
    scope: 'board',
    defaults: { enabled: true, owner: 'both' },
    params: [
      { key: 'captureTarget', label: '提子目标数（0=关闭）', type: 'number', min: 0, max: 200, default: 0 }
    ],

    checkWin(ctx) {
      const target = Number(ctx.cfg.captureTarget) || 0;
      if (target <= 0) return null;
      for (const color of [1, 2]) {
        if (!ctx.engine.enabled('go')) continue;
        if ((State.sideOf(ctx.state, color).captures || 0) >= target) {
          return { winner: color, reason: '提子达到 ' + target + ' 颗' };
        }
      }
      return null;
    },

    arbitrate(ctx) {
      const verdict = GVR.Arbiter.resolve(ctx.proposals);
      if (!verdict) return null;
      const reason = verdict.reason || '满足获胜条件';
      return {
        winner: verdict.winner,
        reason: reason + '（' + State.SIDE_NAME[verdict.winner] + '）',
        cells: verdict.cells || null
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
