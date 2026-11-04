/* 配置文本：只描述「规则 + 参数」，不含任何语句
   格式：
     board = 15
     mod chain on owner=双方 n=5 dirs=横竖斜 mode=至少
     mod go off
*/
(function (root) {
  'use strict';
  const GVR = root.GVR || (root.GVR = {});

  const OWNER_LABEL = { both: '双方', black: '黑方', white: '白方' };
  const OWNER_ALIAS = {
    '双方': 'both', '两边': 'both', 'both': 'both',
    '黑': 'black', '黑方': 'black', 'black': 'black',
    '白': 'white', '白方': 'white', 'white': 'white'
  };
  const VALUE_ALIAS = {
    '横竖斜': 'all', '全部': 'all', 'all': 'all',
    '仅横竖': 'line', '横竖': 'line', 'line': 'line',
    '仅斜线': 'diag', '斜线': 'diag', 'diag': 'diag',
    '至少': 'atLeast', 'atLeast': 'atLeast', 'atleast': 'atLeast',
    '恰好': 'exact', '正好': 'exact', 'exact': 'exact',
    '禁入': 'ban', '禁止': 'ban', 'ban': 'ban',
    '允许': 'allow', 'allow': 'allow'
  };

  function defaultMods() {
    const mods = {};
    for (const mod of GVR.listMods()) {
      const cfg = { enabled: !!(mod.defaults && mod.defaults.enabled), owner: (mod.defaults && mod.defaults.owner) || 'both' };
      if (mod.scope === 'board') cfg.owner = 'both';
      for (const p of (mod.params || [])) cfg[p.key] = p.default;
      Object.assign(cfg, mod.defaults || {});
      mods[mod.id] = cfg;
    }
    return mods;
  }

  function defaultDoc() {
    return { boardSize: 15, mods: defaultMods(), errors: [] };
  }

  function stripComment(line) {
    let out = '';
    let quote = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quote) {
        out += ch;
        if (ch === quote) quote = '';
        continue;
      }
      if (ch === '"' || ch === '\'') { quote = ch; out += ch; continue; }
      if (ch === '#') break;
      out += ch;
    }
    return out.trim();
  }

  function tokenize(line) {
    const tokens = [];
    const re = /"([^"]*)"|'([^']*)'|([^\s]+)/g;
    let m;
    while ((m = re.exec(line))) {
      const v = m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]);
      if (v) tokens.push(v);
    }
    return tokens;
  }

  function coerceParam(mod, field, raw) {
    const s = String(raw).trim();
    if (field.type === 'number') {
      const n = Number(s);
      if (!isFinite(n)) return { error: '参数 ' + field.key + ' 需要数字，收到「' + s + '」' };
      let v = Math.round(n);
      if (field.min != null) v = Math.max(field.min, v);
      if (field.max != null) v = Math.min(field.max, v);
      return { value: v };
    }
    const alias = VALUE_ALIAS[s] !== undefined ? VALUE_ALIAS[s] : s;
    const options = field.options || [];
    const hit = options.find((o) => o.value === alias || o.label === s);
    if (!hit) return { error: '参数 ' + field.key + ' 取值「' + s + '」不在允许范围' };
    return { value: hit.value };
  }

  function parse(text) {
    const doc = defaultDoc();
    const lines = String(text == null ? '' : text).replace(/\r/g, '').split('\n');
    lines.forEach((raw, index) => {
      const no = index + 1;
      const line = stripComment(raw);
      if (!line) return;
      const board = /^(?:board|size|棋盘)\s*=\s*(\d+)$/i.exec(line);
      if (board) {
        const n = Number(board[1]);
        if (n < 5 || n > 25) doc.errors.push({ no, msg: '棋盘尺寸需在 5~25 之间' });
        else doc.boardSize = n;
        return;
      }
      const modLine = /^(?:mod|模块|规则)\s+([A-Za-z0-9_-]+)(.*)$/.exec(line);
      if (!modLine) {
        doc.errors.push({ no, msg: '无法识别的行：' + line });
        return;
      }
      const id = modLine[1];
      const mod = GVR.getMod(id);
      if (!mod) {
        doc.errors.push({ no, msg: '未知规则模组：' + id });
        return;
      }
      const cfg = doc.mods[id] || (doc.mods[id] = {});
      cfg.enabled = true;
      const tokens = tokenize(modLine[2] || '');
      for (const token of tokens) {
        if (/^(on|开|启用)$/i.test(token)) { cfg.enabled = true; continue; }
        if (/^(off|关|禁用)$/i.test(token)) { cfg.enabled = false; continue; }
        const eq = token.indexOf('=');
        if (eq < 0) {
          doc.errors.push({ no, msg: '参数需写成 key=value：' + token });
          continue;
        }
        const key = token.slice(0, eq).trim();
        const val = token.slice(eq + 1).trim();
        if (key === 'owner' || key === '归属方' || key === '方') {
          const owner = OWNER_ALIAS[val];
          if (!owner) { doc.errors.push({ no, msg: '归属方只能是 双方/黑/白：' + val }); continue; }
          if (mod.scope === 'board' && owner !== 'both') {
            doc.errors.push({ no, msg: '规则「' + mod.label + '」是棋盘机制，只能双方生效' });
            continue;
          }
          cfg.owner = owner;
          continue;
        }
        const field = (mod.params || []).find((p) => p.key === key || p.label === key);
        if (!field) {
          doc.errors.push({ no, msg: '规则「' + mod.label + '」没有参数 ' + key });
          continue;
        }
        const r = coerceParam(mod, field, val);
        if (r.error) doc.errors.push({ no, msg: r.error });
        else cfg[field.key] = r.value;
      }
    });
    return doc;
  }

  function valueText(mod, field, value) {
    if (field.type === 'number') return String(value);
    const opt = (field.options || []).find((o) => o.value === value);
    return opt ? opt.label : String(value);
  }

  function serialize(doc) {
    const lines = ['# 五子棋对围棋 · 规则配置（只含规则与参数，可直接编辑/导入）', '# 语法：mod <规则id> on|off owner=双方|黑|白 <参数=值>', ''];
    lines.push('board = ' + doc.boardSize, '');
    for (const mod of GVR.listMods()) {
      const cfg = doc.mods[mod.id] || {};
      if (!cfg.enabled) { lines.push('mod ' + mod.id + ' off'); continue; }
      const parts = ['mod ' + mod.id, 'on'];
      if (mod.scope !== 'board') parts.push('owner=' + (OWNER_LABEL[cfg.owner] || '双方'));
      for (const field of (mod.params || [])) {
        parts.push(field.key + '=' + valueText(mod, field, cfg[field.key]));
      }
      lines.push(parts.join(' '));
    }
    return lines.join('\n') + '\n';
  }

  function ownerLabel(owner) {
    return OWNER_LABEL[owner] || '双方';
  }

  GVR.Config = {
    OWNER_LABEL, OWNER_ALIAS, VALUE_ALIAS,
    defaultDoc, defaultMods, parse, serialize, ownerLabel, stripComment
  };
})(typeof window !== 'undefined' ? window : globalThis);
