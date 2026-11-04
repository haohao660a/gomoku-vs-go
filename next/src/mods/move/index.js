/* 消耗能量移动子：把对方一颗棋子移到合法空点（不触发提子/连珠，不结束回合） */
(function (root) {
  'use strict';
  const GVR = root.GVR || (root.GVR = {});
  const State = GVR.State;

  GVR.registerMod({
    id: 'move',
    label: '消耗能量移动子',
    group: '资源规则',
    summary: '消耗能量，可把对方的一颗棋子移到空点；目标点需合法（不能让该棋块无气）。',
    order: 60,
    scope: 'side',
    defaults: { enabled: false, owner: 'white' },
    params: [
      { key: 'cost', label: '消耗能量', type: 'number', min: 0, max: 20, default: 3 }
    ],
    actions: [{ id: 'move', label: '移动子' }],

    actionState(ctx) {
      const cost = Number(ctx.cfg.cost) || 0;
      if (!ctx.engine.enabled('energy') || !ctx.engine.activeFor('energy', ctx.side)) {
        return { available: false, hint: '需要先启用能量规则（归属方一致）' };
      }
      const energy = State.sideOf(ctx.state, ctx.side).energy || 0;
      if (energy < cost) return { available: false, hint: '能量不足：需要 ' + cost + '，当前 ' + energy };
      return { available: true, cost, hint: '消耗 ' + cost + ' 能量，点击对方棋子再点空点' };
    },

    onAction(ctx) {
      const cost = Number(ctx.cfg.cost) || 0;
      ctx.state.moveMode = { side: ctx.side, cost, actionId: 'move', from: null };
      State.log(ctx.state, '移动子：请点击' + GVR.Board.colorName(GVR.Board.opponent(ctx.side)) +
        '方一颗棋子，再点击空点（再次点击按钮可取消）', 'action');
      return { ok: true, pending: 'move' };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
