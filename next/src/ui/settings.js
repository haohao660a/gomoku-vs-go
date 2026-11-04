/* 设置页：按规则分组渲染「开关 / 归属方 / 参数」面板（纯配置，无脚本） */
(function (root) {
  'use strict';
  const GVR = root.GVR || (root.GVR = {});
  const Config = GVR.Config;

  const OWNER_OPTIONS = [['both', '双方'], ['black', '黑方'], ['white', '白方']];

  function renderMods(container, doc, onChange) {
    container.innerHTML = '';
    const groups = [];
    for (const mod of GVR.listMods()) {
      const key = mod.group || '其他';
      let g = groups.find((x) => x.key === key);
      if (!g) { g = { key, mods: [] }; groups.push(g); }
      g.mods.push(mod);
    }

    for (const group of groups) {
      const section = document.createElement('div');
      section.className = 'mod-group';
      const title = document.createElement('div');
      title.className = 'mod-group-title';
      title.textContent = group.key;
      section.appendChild(title);
      for (const mod of group.mods) {
        section.appendChild(renderModCard(mod, doc, onChange));
      }
      container.appendChild(section);
    }
  }

  function renderModCard(mod, doc, onChange) {
    const cfg = doc.mods[mod.id] || {};
    const card = document.createElement('div');
    card.className = 'mod-card' + (cfg.enabled ? '' : ' disabled');

    const head = document.createElement('div');
    head.className = 'mod-head';
    const sw = document.createElement('label');
    sw.className = 'switch';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!cfg.enabled;
    const slider = document.createElement('span');
    sw.appendChild(cb); sw.appendChild(slider);
    cb.addEventListener('change', () => onChange(mod.id, 'enabled', cb.checked));

    const titleWrap = document.createElement('div');
    titleWrap.className = 'mod-title';
    const name = document.createElement('div');
    name.className = 'mod-name';
    name.innerHTML = mod.label + ' <code>' + mod.id + '</code>';
    const desc = document.createElement('div');
    desc.className = 'mod-desc';
    desc.textContent = mod.summary || '';
    titleWrap.appendChild(name); titleWrap.appendChild(desc);
    head.appendChild(sw); head.appendChild(titleWrap);
    card.appendChild(head);

    if (cfg.enabled) {
      const body = document.createElement('div');
      body.className = 'mod-body';

      if (mod.scope === 'board') {
        const row = document.createElement('div');
        row.className = 'ctl-row';
        const lab = document.createElement('span');
        lab.textContent = '归属方';
        const val = document.createElement('div');
        val.className = 'ctl-static';
        val.textContent = '双方（棋盘机制）';
        row.appendChild(lab); row.appendChild(val);
        body.appendChild(row);
      } else {
        body.appendChild(selectRow('归属方', cfg.owner || 'both', OWNER_OPTIONS,
          (v) => onChange(mod.id, 'owner', v)));
      }

      for (const field of (mod.params || [])) {
        if (field.type === 'select') {
          body.appendChild(selectRow(field.label, cfg[field.key], (field.options || []).map((o) => [o.value, o.label]),
            (v) => onChange(mod.id, field.key, v)));
        } else {
          body.appendChild(numberRow(field, cfg[field.key], (v) => onChange(mod.id, field.key, v)));
        }
      }

      if (dependsOnEnergy(mod.id) && !energyReady(doc, cfg.owner)) {
        const note = document.createElement('div');
        note.className = 'mod-note';
        note.textContent = '依赖能量规则：需启用「能量」并覆盖相同归属方，否则此规则的动作不可用。';
        body.appendChild(note);
      }
      card.appendChild(body);
    }
    return card;
  }

  function dependsOnEnergy(id) {
    return id === 'combo' || id === 'move' || id === 'gain';
  }

  function energyReady(doc, owner) {
    const e = doc.mods.energy;
    if (!e || !e.enabled) return false;
    if (owner === 'both' || e.owner === 'both') return true;
    return e.owner === owner;
  }

  function selectRow(label, value, options, onChange) {
    const row = document.createElement('div');
    row.className = 'ctl-row';
    const lab = document.createElement('span');
    lab.textContent = label;
    const sel = document.createElement('select');
    for (const [v, text] of options) {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = text;
      if (String(value) === String(v)) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => onChange(sel.value));
    row.appendChild(lab); row.appendChild(sel);
    return row;
  }

  function numberRow(field, value, onChange) {
    const row = document.createElement('div');
    row.className = 'ctl-row';
    const lab = document.createElement('span');
    lab.textContent = field.label;
    const input = document.createElement('input');
    input.type = 'number';
    if (field.min != null) input.min = field.min;
    if (field.max != null) input.max = field.max;
    input.step = '1';
    input.value = value != null ? value : (field.default || 0);
    input.addEventListener('change', () => {
      let v = Number(input.value);
      if (!isFinite(v)) v = field.min || 0;
      v = Math.round(v);
      if (field.min != null) v = Math.max(field.min, v);
      if (field.max != null) v = Math.min(field.max, v);
      input.value = v;
      onChange(v);
    });
    row.appendChild(lab); row.appendChild(input);
    return row;
  }

  /* 设置页的能量条实时预览：与能量规则的开关/参数联动 */
  function renderEnergyPreview(container, doc) {
    container.innerHTML = '';
    const cfg = doc.mods.energy;
    const title = document.createElement('div');
    title.className = 'preview-title';
    title.textContent = '能量条预览（随配置联动）';
    container.appendChild(title);

    const wrap = document.createElement('div');
    wrap.className = 'preview-body';
    if (!cfg || !cfg.enabled) {
      const empty = document.createElement('div');
      empty.className = 'energy-empty';
      empty.textContent = '能量规则未启用：依赖能量的规则不可用。';
      wrap.appendChild(empty);
      container.appendChild(wrap);
      return;
    }
    const owners = cfg.owner === 'both' ? [1, 2] : [cfg.owner === 'black' ? 1 : 2];
    for (const color of owners) {
      const box = document.createElement('div');
      box.className = 'preview-side';
      const name = document.createElement('div');
      name.className = 'preview-side-name';
      name.textContent = GVR.Board.colorName(color) + '方';
      box.appendChild(name);
      const bar = document.createElement('div');
      GVR.EnergyBar.render(bar, {
        value: Math.max(Number(cfg.min) || 0, Math.min(Number(cfg.max) || 1, Number(cfg.init) || 0)),
        min: cfg.min, max: cfg.max, label: '初始能量'
      });
      box.appendChild(bar);
      wrap.appendChild(box);
    }
    container.appendChild(wrap);

    const deps = [];
    if (doc.mods.gain && doc.mods.gain.enabled) {
      deps.push('对方落子 +' + (Number(doc.mods.gain.amount) || 0) + ' 能量');
    }
    if (doc.mods.combo && doc.mods.combo.enabled) {
      deps.push('连打：' + (Number(doc.mods.combo.cost) || 0) + ' 能量 → 额外 ' +
        (Number(doc.mods.combo.extra) || 1) + ' 子（每回合 ' + (Number(doc.mods.combo.perTurn) || 1) + ' 次）');
    }
    if (doc.mods.move && doc.mods.move.enabled) {
      deps.push('移动子：' + (Number(doc.mods.move.cost) || 0) + ' 能量');
    }
    const line = document.createElement('div');
    line.className = 'preview-deps';
    line.textContent = deps.length ? deps.join(' · ') : '当前没有规则消耗/获取能量';
    container.appendChild(line);
  }

  function renderErrors(container, errors) {
    container.innerHTML = '';
    if (!errors || !errors.length) {
      container.classList.add('hidden');
      return;
    }
    container.classList.remove('hidden');
    for (const e of errors.slice(0, 12)) {
      const row = document.createElement('div');
      row.className = 'error-row';
      row.textContent = (e.no ? '第 ' + e.no + ' 行：' : '') + e.msg;
      container.appendChild(row);
    }
  }

  GVR.Settings = {
    renderMods, renderEnergyPreview, renderErrors,
    ownerLabel: Config.ownerLabel
  };
})(typeof window !== 'undefined' ? window : globalThis);
