/* 能量条组件：对局侧栏与设置页预览共用（UI 扩展点示例） */
(function (root) {
  'use strict';
  const GVR = root.GVR || (root.GVR = {});

  /** opts: {value, min, max, label, empty} */
  function render(container, opts) {
    const o = Object.assign({ value: 0, min: 0, max: 10, label: '能量', empty: '' }, opts || {});
    container.innerHTML = '';
    if (o.empty) {
      const tip = document.createElement('div');
      tip.className = 'energy-empty';
      tip.textContent = o.empty;
      container.appendChild(tip);
      return;
    }
    const max = Math.max(1, Number(o.max) || 0);
    const value = Math.max(0, Math.min(max, Number(o.value) || 0));

    const head = document.createElement('div');
    head.className = 'kv';
    const name = document.createElement('span');
    name.textContent = o.label;
    const num = document.createElement('b');
    num.textContent = value + ' / ' + max;
    head.appendChild(name); head.appendChild(num);
    container.appendChild(head);

    const cells = document.createElement('div');
    cells.className = 'energy-cells';
    for (let i = 0; i < max; i++) {
      const cell = document.createElement('div');
      cell.className = 'energy-cell' + (i < value ? ' on' : '');
      cells.appendChild(cell);
    }
    container.appendChild(cells);
  }

  GVR.EnergyBar = { render };
})(typeof window !== 'undefined' ? window : globalThis);
