/* 规则引擎：装配模组钩子、驱动回合、落子与主动动作、接入胜负仲裁 */
(function (root) {
  'use strict';
  const GVR = root.GVR || (root.GVR = {});
  const B = GVR.Board, State = GVR.State;

  const PLACE_HOOKS = ['validatePlace', 'afterPlace', 'turnStart', 'turnEnd'];

  class Engine {
    constructor(doc) {
      this.doc = doc;
      this.state = null;
      this.bus = null;
      this.warnings = [];
      this._warned = new Set();
    }

    /* ---------- 模组与配置 ---------- */

    mods() { return GVR.listMods(); }

    cfg(id) { return (this.doc.mods && this.doc.mods[id]) || {}; }

    enabled(id) {
      if (!GVR.getMod(id)) return false;
      return !!this.cfg(id).enabled;
    }

    activeFor(id, color) {
      if (!this.enabled(id)) return false;
      const mod = GVR.getMod(id);
      if (!mod || mod.scope === 'board') return true;
      const owner = this.cfg(id).owner || 'both';
      if (owner === 'both') return true;
      return owner === State.SIDE_KEY[color];
    }

    sideVars(color) { return State.sideOf(this.state, color); }

    warn(msg) {
      const item = { turn: this.state ? this.state.moves.length : 0, msg };
      this.warnings.push(item);
      if (this.state) State.log(this.state, msg, 'warn');
    }

    warnOnce(key, msg) {
      if (this._warned.has(key)) return;
      this._warned.add(key);
      this.warn(msg);
    }

    /* ---------- 开局 ---------- */

    newGame() {
      const size = Math.max(5, Math.min(25, Number(this.doc.boardSize) || 15));
      this.state = State.create(size);
      this.warnings = [];
      this._warned.clear();
      this.bus = GVR.createBus();

      for (const mod of this.mods()) {
        for (const hook of PLACE_HOOKS) {
          if (typeof mod[hook] !== 'function') continue;
          this.bus.on(hook, (ctx) => this.invoke(mod, hook, ctx), mod.order);
        }
        if (typeof mod.checkWin === 'function') {
          this.bus.on('checkWin', (ctx) => this.invoke(mod, 'checkWin', ctx), mod.order);
        }
      }

      for (const mod of this.mods()) {
        if (!this.enabled(mod.id) || typeof mod.init !== 'function') continue;
        try {
          mod.init({ engine: this, state: this.state, cfg: this.cfg(mod.id) });
        } catch (e) {
          this.warn('规则「' + mod.label + '」初始化失败：' + e.message);
        }
      }

      State.log(this.state, '对局开始 · ' + size + '×' + size + ' · 黑方先行', 'sys');
      return this.state;
    }

    invoke(mod, hook, ctx) {
      if (!this.enabled(mod.id)) return null;
      if (mod.scope === 'side' && ctx && ctx.color && !this.activeFor(mod.id, ctx.color)) return null;
      const view = Object.assign({ engine: this, state: this.state, cfg: this.cfg(mod.id) }, ctx);
      return mod[hook](view);
    }

    /* ---------- 落子 ---------- */

    tryMove(x, y, color) {
      const st = this.state;
      if (!st) return { ok: false, error: '对局未开始' };
      if (st.ended) return { ok: false, error: '对局已结束' };
      if (st.moveMode) return { ok: false, error: '正在移动棋子，请先选择目标点或取消' };
      const side = color || st.turn;
      if (st.turn !== side) return { ok: false, error: '还没轮到' + B.colorName(side) + '方' };
      if (!B.inBounds(st.size, x, y)) return { ok: false, error: '超出棋盘' };
      if (st.board[y][x] !== B.EMPTY) return { ok: false, error: '该点已有棋子' };

      const ctx = { color: side, x, y, captured: [] };
      const pre = this.bus.emit('validatePlace', ctx);
      if (!pre.ok) return { ok: false, error: pre.error };

      st.board[y][x] = side;
      st.lastMove = { x, y, color: side };
      st.moves.push({ x, y, color: side });
      st.turnActions += 1;

      const post = this.bus.emit('afterPlace', ctx);
      if (!post.ok) this.warn(post.error);

      this.resolveWin(ctx);

      if (!st.ended) {
        if ((st.extraMoves || 0) > 0) {
          st.extraMoves -= 1;
          State.log(st, B.colorName(side) + '方额外落子，本回合继续', 'turn');
        } else {
          this.nextTurn();
        }
      }
      return { ok: true, captured: ctx.captured };
    }

    nextTurn() {
      const st = this.state;
      const prev = st.turn;
      this.bus.emit('turnEnd', { color: prev });
      st.turn = B.opponent(prev);
      st.turnActions = 0;
      st.moveMode = null;
      this.bus.emit('turnStart', { color: st.turn });
      State.log(st, '轮到' + B.colorName(st.turn) + '方', 'turn');
    }

    /* ---------- 胜负 ---------- */

    resolveWin(ctx) {
      const st = this.state;
      if (st.ended) return null;
      const r = this.bus.emit('checkWin', ctx);
      const proposals = (r.results || []).filter((p) => p && (p.winner === 1 || p.winner === 2));
      if (!proposals.length) return null;

      const winMod = GVR.getMod('win');
      if (!winMod || !this.enabled('win')) {
        this.warnOnce('win-off', '获胜规则未启用：满足获胜条件但无法结算');
        return null;
      }
      let verdict = null;
      try {
        verdict = winMod.arbitrate({
          engine: this, state: st, cfg: this.cfg('win'), proposals
        });
      } catch (e) {
        this.warn('胜负仲裁失败：' + e.message);
        return null;
      }
      if (verdict) this.endGame(verdict.winner, verdict.reason, verdict.cells);
      return verdict;
    }

    endGame(winner, reason, cells) {
      const st = this.state;
      if (!st || st.ended) return false;
      st.ended = true;
      st.winner = winner;
      st.winReason = reason || '满足结束条件';
      if (cells && cells.length) st.winLine = cells;
      const who = winner === 0 ? '平局' : B.colorName(winner) + '方';
      State.log(st, '对局结束：' + who + ' —— ' + st.winReason, 'end');
      return true;
    }

    /* ---------- 能量（能量 mod 写入状态，其余规则通过引擎读写） ---------- */

    energyOf(color) { return this.sideVars(color).energy || 0; }

    addEnergy(color, amount, reason) {
      const v = this.sideVars(color);
      if ((v.energyMax || 0) <= 0) {
        this.warnOnce('energy-off', '能量规则未启用，无法获得能量');
        return 0;
      }
      const before = v.energy || 0;
      const min = v.energyMin || 0;
      const max = v.energyMax || 0;
      v.energy = Math.max(min, Math.min(max, before + Number(amount || 0)));
      const delta = v.energy - before;
      if (delta !== 0) {
        State.log(this.state, B.colorName(color) + '方能量 ' + (delta > 0 ? '+' : '') + delta +
          '（' + before + '→' + v.energy + '）' + (reason ? ' · ' + reason : ''), 'energy');
      }
      return delta;
    }

    spendEnergy(color, amount) {
      const v = this.sideVars(color);
      const cost = Number(amount || 0);
      if (cost <= 0) return true;
      if (!this.enabled('energy') || !this.activeFor('energy', color)) return false;
      if ((v.energy || 0) < cost) return false;
      const before = v.energy;
      v.energy = before - cost;
      State.log(this.state, B.colorName(color) + '方消耗 ' + cost + ' 能量（' + before + '→' + v.energy + '）', 'energy');
      return true;
    }

    /* ---------- 主动动作（连打 / 移动子等） ---------- */

    listActions(color) {
      const out = [];
      const st = this.state;
      if (!st || st.ended) return out;
      for (const mod of this.mods()) {
        if (!mod.actions || !this.activeFor(mod.id, color)) continue;
        for (const action of mod.actions) {
          let info = { available: true, hint: '' };
          if (typeof mod.actionState === 'function') {
            try {
              info = Object.assign({ available: true, hint: '' }, mod.actionState({
                engine: this, state: st, cfg: this.cfg(mod.id), side: color, color, action: action.id
              }) || {});
            } catch (e) {
              info = { available: false, hint: e.message };
            }
          }
          out.push({
            id: action.id, label: action.label, modId: mod.id,
            available: info.available !== false,
            hint: info.hint || '',
            cost: info.cost
          });
        }
      }
      return out;
    }

    runAction(color, actionId) {
      const st = this.state;
      if (!st) return { ok: false, error: '对局未开始' };
      if (st.ended) return { ok: false, error: '对局已结束' };
      if (st.turn !== color) return { ok: false, error: '还没轮到' + B.colorName(color) + '方' };

      if (actionId === 'resign') {
        this.endGame(B.opponent(color), B.colorName(color) + '方认输');
        return { ok: true };
      }

      if (st.moveMode && actionId === st.moveMode.actionId) {
        st.moveMode = null;
        State.log(st, B.colorName(color) + '方取消移动', 'action');
        return { ok: true, cancelled: true };
      }

      const provider = this.mods().find((m) => this.activeFor(m.id, color) &&
        (m.actions || []).some((a) => a.id === actionId));
      if (!provider) return { ok: false, error: '该操作未启用' };

      const info = Object.assign({ available: true, hint: '' }, (provider.actionState ? provider.actionState({
        engine: this, state: st, cfg: this.cfg(provider.id), side: color, color, action: actionId
      }) : {}) || {});
      if (info.available === false) return { ok: false, error: info.hint || '该操作当前不可用' };

      try {
        const res = provider.onAction({
          engine: this, state: st, cfg: this.cfg(provider.id), side: color, color, action: actionId
        });
        if (res && res.error) return { ok: false, error: res.error };
        return Object.assign({ ok: true }, res || {});
      } catch (e) {
        return { ok: false, error: provider.label + ' 执行失败：' + e.message };
      }
    }

    /** 移动子：消耗能量把对方一颗棋子移到空点（不触发提子/连珠，不结束回合） */
    executeMove(side, from, to) {
      const st = this.state;
      if (!st || st.ended) return { ok: false, error: '对局已结束' };
      const mode = st.moveMode;
      if (!mode || mode.side !== side) return { ok: false, error: '未进入移动模式' };
      if (!B.inBounds(st.size, from[0], from[1]) || !B.inBounds(st.size, to[0], to[1])) {
        return { ok: false, error: '超出棋盘' };
      }
      const mover = B.opponent(side);
      if (st.board[from[1]][from[0]] !== mover) return { ok: false, error: '只能移动对方的棋子' };
      if (st.board[to[1]][to[0]] !== B.EMPTY) return { ok: false, error: '目标点已有棋子' };

      st.board[from[1]][from[0]] = B.EMPTY;
      st.board[to[1]][to[0]] = mover;
      const group = B.groupAt(st.board, st.size, to[0], to[1]);
      if (!group || group.liberties === 0) {
        st.board[to[1]][to[0]] = B.EMPTY;
        st.board[from[1]][from[0]] = mover;
        return { ok: false, error: '目标点会让该棋子无气，非法' };
      }
      if (!this.spendEnergy(side, mode.cost)) {
        st.board[to[1]][to[0]] = B.EMPTY;
        st.board[from[1]][from[0]] = mover;
        return { ok: false, error: '能量不足以移动棋子' };
      }

      st.moveMode = null;
      st.lastMove = { x: to[0], y: to[1], color: mover, moved: true };
      State.log(st, B.colorName(side) + '方把' + B.colorName(mover) + '方棋子从 (' + from[0] + ',' + from[1] +
        ') 移到 (' + to[0] + ',' + to[1] + ')，未触发提子/连珠', 'action');
      return { ok: true };
    }
  }

  GVR.Engine = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
