/* 能量：为归属方提供能量条（初始值、上下限可配），供其他规则获取/消耗 */
(function (root) {
  'use strict';
  const GVR = root.GVR || (root.GVR = {});
  const State = GVR.State;

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  GVR.registerMod({
    id: 'energy',
    label: '能量',
    group: '资源规则',
    summary: '为一方建立能量池；依赖能量的规则（连打、移动子等）在能量不足时不可用。',
    order: 30,
    scope: 'side',
    defaults: { enabled: false, owner: 'white' },
    params: [
      { key: 'init', label: '初始能量', type: 'number', min: 0, max: 99, default: 0 },
      { key: 'min', label: '下限', type: 'number', min: 0, max: 99, default: 0 },
      { key: 'max', label: '上限', type: 'number', min: 1, max: 99, default: 10 }
    ],

    init(ctx) {
      const cfg = ctx.cfg;
      const min = Math.max(0, Number(cfg.min) || 0);
      let max = Math.max(1, Number(cfg.max) || 10);
      if (max < min) max = min;
      for (const color of [1, 2]) {
        if (!ctx.engine.activeFor('energy', color)) continue;
        const v = State.sideOf(ctx.state, color);
        v.energyMin = min;
        v.energyMax = max;
        v.energy = clamp(Number(cfg.init) || 0, min, max);
      }
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
