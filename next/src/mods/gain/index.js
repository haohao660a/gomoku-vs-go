/* 对方落子加能量：对手每落一子，归属方获得 m 点能量 */
(function (root) {
  'use strict';
  const GVR = root.GVR || (root.GVR = {});
  const B = GVR.Board;

  GVR.registerMod({
    id: 'gain',
    label: '对方落子加能量',
    group: '资源规则',
    summary: '对手每落一子，归属方获得 m 点能量（需要同时启用能量规则）。',
    order: 40,
    scope: 'any', // 归属方是「受益方」，不是落子方，故内部按受益方判定
    defaults: { enabled: false, owner: 'white' },
    params: [
      { key: 'amount', label: '每子获得', type: 'number', min: 1, max: 10, default: 1 }
    ],

    afterPlace(ctx) {
      const engine = ctx.engine;
      const beneficiary = B.opponent(ctx.color);
      if (!engine.activeFor('gain', beneficiary)) return;
      const amount = Number(ctx.cfg.amount) || 0;
      if (amount <= 0) return;
      engine.addEnergy(beneficiary, amount, '对方落子');
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
