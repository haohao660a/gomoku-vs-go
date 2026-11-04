/* 胜负仲裁：把各规则提交的获胜提案收敛为一个结论（纯函数） */
(function (root) {
  'use strict';
  const GVR = root.GVR || (root.GVR = {});

  function resolve(proposals) {
    const list = (proposals || []).filter((p) => p && (p.winner === 1 || p.winner === 2));
    if (!list.length) return null;
    // 多规则同时成立时取规则 order 更靠前者（提案已按 order 收集）
    return list[0];
  }

  GVR.Arbiter = { resolve };
})(typeof window !== 'undefined' ? window : globalThis);
