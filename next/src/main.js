/* 应用主流程：配置页 ⇄ 对局页、配置持久化、导入导出 */
(function (root) {
  'use strict';
  const GVR = root.GVR;
  const Settings = GVR.Settings;
  const Config = GVR.Config;

  const LS_CONFIG = 'gvg3.config';
  const LS_TPL = 'gvg3.template';

  let configText = '';
  let doc = null;
  let engine = null;
  let gameView = null;
  let activeTemplateKey = null;
  let toastTimer = null;
  let parseTimer = null;

  const $ = (id) => document.getElementById(id);

  function boot() {
    gameView = new GVR.GameView({
      board: $('board'),
      statusText: $('statusText'),
      blackPanel: $('blackPanel'),
      whitePanel: $('whitePanel'),
      actionBar: $('actionBar'),
      logList: $('logList'),
      overlay: $('overlay'),
      resultText: $('resultText'),
      resultReason: $('resultReason')
    }, { onToast: toast });

    const savedKey = localStorage.getItem(LS_TPL);
    if (savedKey && GVR.TEMPLATES.some((t) => t.key === savedKey)) activeTemplateKey = savedKey;
    const savedText = localStorage.getItem(LS_CONFIG);

    if (savedText && savedText.trim()) {
      if (!activeTemplateKey) activeTemplateKey = null;
      applyText(savedText, { persist: false });
    } else {
      activeTemplateKey = activeTemplateKey || 'mix-energy';
      applyText(GVR.getTemplate(activeTemplateKey).text, { persist: false });
    }
    renderTemplates();

    $('startBtn').addEventListener('click', startGame);
    $('restartBtn').addEventListener('click', restart);
    $('againBtn').addEventListener('click', restart);
    $('backBtn').addEventListener('click', showSetup);
    $('overlayBackBtn').addEventListener('click', showSetup);
    $('resetBtn').addEventListener('click', () => {
      activeTemplateKey = 'mix-energy';
      localStorage.setItem(LS_TPL, activeTemplateKey);
      applyText(GVR.getTemplate(activeTemplateKey).text);
      renderAll();
      toast('已恢复默认模板（未开局前可继续调整）');
    });
    $('importBtn').addEventListener('click', () => $('fileInput').click());
    $('fileInput').addEventListener('change', onImport);
    $('exportBtn').addEventListener('click', onExport);

    $('configText').addEventListener('input', (e) => {
      configText = e.target.value;
      activeTemplateKey = null;
      localStorage.removeItem(LS_TPL);
      clearTimeout(parseTimer);
      parseTimer = setTimeout(() => {
        parseNow();
        renderTemplates();
      }, 200);
    });

    window.addEventListener('resize', () => {
      if (!$('screenGame').classList.contains('hidden') && engine) gameView.resize();
    });

    showSetup();
  }

  /* ---------- 配置 ---------- */

  function applyText(text, opts) {
    opts = opts || {};
    configText = String(text || '');
    $('configText').value = configText;
    if (opts.persist !== false) localStorage.setItem(LS_CONFIG, configText);
    parseNow();
  }

  function parseNow() {
    doc = Config.parse(configText);
    Settings.renderErrors($('parseErrors'), doc.errors);
    Settings.renderMods($('modList'), doc, onModChange);
    Settings.renderEnergyPreview($('energyPreview'), doc);
    updateHint();
  }

  function updateHint() {
    const enabled = GVR.listMods().filter((m) => doc.mods[m.id] && doc.mods[m.id].enabled);
    const hint = $('setupHint');
    if (doc.errors.length) {
      hint.textContent = '配置有 ' + doc.errors.length + ' 处错误，修正后才能开局';
      hint.style.color = 'var(--danger)';
      return;
    }
    hint.style.color = '';
    hint.textContent = '配置有效 · ' + doc.boardSize + '×' + doc.boardSize + ' · 已启用 ' +
      enabled.map((m) => m.label).join('、') + '（共 ' + enabled.length + ' 条规则）';
    $('startBtn').disabled = false;
  }

  function renderAll() {
    parseNow();
    renderTemplates();
  }

  function renderTemplates() {
    GVR.TemplateList.render($('templateList'), activeTemplateKey, (tpl) => {
      activeTemplateKey = tpl.key;
      localStorage.setItem(LS_TPL, tpl.key);
      applyText(tpl.text);
      renderTemplates();
      toast('已套用模板：' + tpl.name);
    });
  }

  function onModChange(id, key, value) {
    if (!doc.mods[id]) return;
    doc.mods[id][key] = value;
    configText = Config.serialize(doc);
    $('configText').value = configText;
    localStorage.setItem(LS_CONFIG, configText);
    activeTemplateKey = null;
    localStorage.removeItem(LS_TPL);
    parseNow();
    renderTemplates();
  }

  /* ---------- 对局 ---------- */

  function startGame() {
    if (doc.errors.length) {
      toast('配置有 ' + doc.errors.length + ' 处错误，请先修正');
      $('configText').focus();
      return;
    }
    try {
      engine = new GVR.Engine(doc);
      engine.newGame();
    } catch (e) {
      toast('开局失败：' + e.message);
      return;
    }
    $('screenSetup').classList.add('hidden');
    $('screenGame').classList.remove('hidden');
    gameView.start(engine);
  }

  function restart() {
    if (!engine) return;
    engine.newGame();
    gameView.render();
    toast('已重开（使用开局时保存的配置）');
  }

  function showSetup() {
    $('screenGame').classList.add('hidden');
    $('screenSetup').classList.remove('hidden');
    parseNow();
  }

  /* ---------- 导入 / 导出 ---------- */

  function onImport(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      activeTemplateKey = null;
      applyText(String(reader.result || ''));
      renderTemplates();
      toast('已导入配置：' + file.name);
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  }

  function onExport() {
    const name = '五子棋对围棋-' + (activeTemplateKey || '自定义') + '.rules';
    const blob = new Blob([configText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('已导出 ' + name);
  }

  /* ---------- Toast ---------- */

  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 2400);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
