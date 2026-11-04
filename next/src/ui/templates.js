/* 模板页：内置模板卡片 + 文件扩展说明 */
(function (root) {
  'use strict';
  const GVR = root.GVR || (root.GVR = {});

  function render(container, activeKey, onPick) {
    container.innerHTML = '';
    for (const tpl of GVR.TEMPLATES) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'tpl-card' + (tpl.key === activeKey ? ' active' : '');
      const name = document.createElement('div');
      name.className = 'tpl-name';
      name.textContent = tpl.name;
      const desc = document.createElement('div');
      desc.className = 'tpl-desc';
      desc.textContent = tpl.desc || '';
      card.appendChild(name);
      card.appendChild(desc);
      card.addEventListener('click', () => onPick(tpl));
      container.appendChild(card);
    }
  }

  GVR.TemplateList = { render };
})(typeof window !== 'undefined' ? window : globalThis);
