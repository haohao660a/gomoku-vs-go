/* 模组注册表：新增规则只需 registerMod，不改核心 */
(function (root) {
  'use strict';
  const GVR = root.GVR || (root.GVR = {});

  const MODS = [];

  /**
   * 注册一个规则模组。
   * 必需：id / label / defaults（enabled、owner 及参数初值）
   * 可选：group（设置页分组）、summary、order（求值顺序）、scope（'side' 按归属方生效 / 'both' 棋盘机制）
   *       params（参数 schema：{key,label,type:'number'|'select',min,max,options,default}）
   *       钩子：init / validatePlace / afterPlace / turnStart / turnEnd / checkWin / arbitrate
   *       动作：actions([{id,label}]) / actionState / onAction
   */
  function registerMod(mod) {
    if (!mod || !mod.id) throw new Error('模组缺少 id');
    const idx = MODS.findIndex((m) => m.id === mod.id);
    if (idx >= 0) MODS[idx] = mod;
    else MODS.push(mod);
    return mod;
  }

  function getMod(id) {
    return MODS.find((m) => m.id === id) || null;
  }

  function listMods() {
    return MODS.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  GVR.MODS = MODS;
  GVR.registerMod = registerMod;
  GVR.getMod = getMod;
  GVR.listMods = listMods;
})(typeof window !== 'undefined' ? window : globalThis);
