/* 能量连打：消耗 n 点能量，本回合可额外多下 m 颗子（次数与消耗可配） */
(function (root) {
  'use strict';
  const GVR = root.GVR || (root.GVR = {});
  const B = GVR.Board, State = GVR.State;

  function stateOf(ctx) {
    return State.sideOf(ctx.state, ctx.side);
  }

  GVR.registerMod({
    id: 'combo',
    label: '能量连打',
    group: '资源规则',
    summary: '消耗能量，本回合获得额外落子机会；每回合可用次数与消耗点数可配。',
    order: 50,
    scope: 'side',
    defaults: { enabled: false, owner: 'white' },
    params: [
      { key: 'cost', label: '消耗能量', type: 'number', min: 0, max: 20, default: 5 },
      { key: 'extra', label: '额外落子数', type: 'number', min: 1, max: 5, default: 1 },
      { key: 'perTurn', label: '每回合次数', type: 'number', min: 1, max: 5, default: 1 }
    ],
    actions: [{ id: 'combo', label: '连打' }],

    init(ctx) {
      for (const color of [1, 2]) {
        if (!ctx.engine.activeFor('combo', color)) continue;
        State.sideOf(ctx.state, color).combos = 0;
      }
    },

    turnStart(ctx) {
      State.sideOf(ctx.state, ctx.color).combos = 0;
    },

    actionState(ctx) {
      const cfg = ctx.cfg;
      const cost = Number(cfg.cost) || 0;
      const side = stateOf(ctx);
      if (!ctx.engine.enabled('energy') || !ctx.engine.activeFor('energy', ctx.side)) {
        return { available: false, hint: '需要先启用能量规则（归属方一致）' };
      }
      if ((side.combos || 0) >= (Number(cfg.perTurn) || 1)) {
        return { available: false, hint: '本回合连打次数已用完' };
      }
      if ((side.energy || 0) < cost) {
        return { available: false, hint: '能量不足：需要 ' + cost + '，当前 ' + (side.energy || 0) };
      }
      return { available: true, cost, hint: '消耗 ' + cost + ' 能量，本回合额外落子 +' + (Number(cfg.extra) || 1) };
    },

    onAction(ctx) {
      const cfg = ctx.cfg;
      const cost = Number(cfg.cost) || 0;
      const extra = Math.max(1, Number(cfg.extra) || 1);
      const side = stateOf(ctx);
      if (!ctx.engine.spendEnergy(ctx.side, cost)) {
        return { error: '能量不足，无法连打' };
      }
      side.combos = (side.combos || 0) + 1;
      ctx.state.extraMoves = (ctx.state.extraMoves || 0) + extra;
      State.log(ctx.state, B.colorName(ctx.side) + '方连打：消耗 ' + cost + ' 能量，本回合额外落子 +' + extra, 'action');
      return { ok: true };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
