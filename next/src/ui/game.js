/* 对局页：棋盘、双方面板（含能量条）、动作栏、日志、结算 */
(function (root) {
  'use strict';
  const GVR = root.GVR || (root.GVR = {});
  const B = GVR.Board, State = GVR.State;

  class GameView {
    constructor(dom, opts) {
      this.dom = dom;
      this.onToast = (opts && opts.onToast) || function () {};
      this.onBack = (opts && opts.onBack) || function () {};
      this.engine = null;
      this.view = new GVR.BoardView(dom.board);
      this.view.attach((x, y) => this.handleCell(x, y));
    }

    start(engine) {
      this.engine = engine;
      this.render();
      setTimeout(() => this.view.resize(), 20);
    }

    resize() {
      if (this.engine) this.view.resize();
    }

    cancelMove() {
      const st = this.engine && this.engine.state;
      if (!st || !st.moveMode) return;
      const res = this.engine.runAction(st.moveMode.side, st.moveMode.actionId);
      if (!res.ok) this.onToast(res.error);
      this.render();
    }

    handleCell(x, y) {
      const engine = this.engine;
      if (!engine || !engine.state || engine.state.ended) return;
      const st = engine.state;
      if (st.moveMode) {
        const mover = B.opponent(st.moveMode.side);
        if (!st.moveMode.from) {
          if (st.board[y][x] !== mover) {
            this.onToast('请先点击' + B.colorName(mover) + '方的一颗棋子');
            return;
          }
          st.moveMode.from = [x, y];
          this.render();
          return;
        }
        const res = engine.executeMove(st.moveMode.side, st.moveMode.from, [x, y]);
        if (!res.ok) this.onToast(res.error);
        this.render();
        return;
      }
      const res = engine.tryMove(x, y);
      if (!res.ok) this.onToast(res.error);
      this.render();
    }

    render() {
      if (!this.engine) return;
      const engine = this.engine;
      const st = engine.state;
      this.view.render(engine, {
        interactive: true,
        turn: st.turn,
        moveMode: st.moveMode,
        selected: st.moveMode && st.moveMode.from,
        coords: false
      });
      this.renderStatus();
      this.renderSide(this.dom.blackPanel, 1);
      this.renderSide(this.dom.whitePanel, 2);
      this.renderActions();
      this.renderLog();
      this.renderOverlay();
    }

    renderStatus() {
      const st = this.engine.state;
      const el = this.dom.statusText;
      el.classList.toggle('ended', st.ended);
      el.classList.toggle('my-turn', !st.ended);
      if (st.ended) {
        el.textContent = '对局结束：' + (st.winner ? B.colorName(st.winner) + '方胜' : '平局') + ' · ' + st.winReason;
        return;
      }
      let text = '轮到' + B.colorName(st.turn) + '方 · 第 ' + (st.moves.length + 1) + ' 手';
      if (st.extraMoves > 0) text += ' · 额外落子 ×' + st.extraMoves;
      if (st.moveMode) text += ' · 移动子：点击对方棋子后点空点';
      el.textContent = text;
    }

    renderSide(el, color) {
      const engine = this.engine;
      const st = engine.state;
      const side = State.sideOf(st, color);
      const name = B.colorName(color) + '方';
      el.innerHTML = '';
      const head = document.createElement('div');
      head.className = 'sp-head';
      head.innerHTML = '<span class="dot ' + (color === 1 ? 'black' : 'white') + '"></span>' + name;
      el.appendChild(head);

      if (engine.enabled('go')) {
        const target = Number(engine.cfg('win').captureTarget) || 0;
        el.appendChild(kv('提子', (side.captures || 0) + (target > 0 ? ' / ' + target : '')));
      }
      if (engine.activeFor('chain', color)) {
        el.appendChild(kv('当前连珠', (side.chainLen || 0) + ' 子'));
      }
      if (engine.activeFor('energy', color) && (side.energyMax || 0) > 0) {
        const box = document.createElement('div');
        box.className = 'energy-row';
        GVR.EnergyBar.render(box, { value: side.energy, max: side.energyMax, label: '能量' });
        el.appendChild(box);
      }
      if (engine.activeFor('combo', color)) {
        el.appendChild(kv('本回合连打', (side.combos || 0) + ' / ' + (Number(engine.cfg('combo').perTurn) || 1)));
      }
      el.classList.toggle('active', st.turn === color && !st.ended);
    }

    renderActions() {
      const engine = this.engine;
      const st = engine.state;
      const bar = this.dom.actionBar;
      bar.innerHTML = '';
      const list = engine.listActions(st.turn);
      for (const item of list) {
        const isCancel = st.moveMode && st.moveMode.actionId === item.id;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn small action-btn';
        btn.textContent = isCancel ? '取消移动子' : item.label + (item.cost ? '（' + item.cost + ' 能量）' : '');
        btn.disabled = !isCancel && (!item.available || st.ended);
        if (item.hint) btn.title = item.hint;
        btn.addEventListener('click', () => {
          const res = engine.runAction(st.turn, item.id);
          if (!res.ok) this.onToast(res.error);
          this.render();
        });
        bar.appendChild(btn);
      }
      const hint = document.createElement('div');
      hint.className = 'action-hint';
      const unavailable = list.find((i) => !i.available && !st.moveMode);
      hint.textContent = st.ended ? '' : (unavailable ? unavailable.hint : '');
      bar.appendChild(hint);

      const resign = document.createElement('button');
      resign.type = 'button';
      resign.className = 'btn small danger';
      resign.textContent = '认输';
      resign.disabled = st.ended;
      resign.addEventListener('click', () => {
        if (!window.confirm('确定认输吗？')) return;
        const res = engine.runAction(st.turn, 'resign');
        if (!res.ok) this.onToast(res.error);
        this.render();
      });
      bar.appendChild(resign);
    }

    renderLog() {
      const list = this.dom.logList;
      list.innerHTML = '';
      const st = this.engine.state;
      for (const item of st.log.slice(-24).reverse()) {
        const li = document.createElement('li');
        li.className = item.kind;
        li.textContent = item.text;
        list.appendChild(li);
      }
    }

    renderOverlay() {
      const st = this.engine.state;
      const ov = this.dom.overlay;
      if (!st.ended) { ov.classList.add('hidden'); return; }
      ov.classList.remove('hidden');
      this.dom.resultText.textContent = st.winner ? B.colorName(st.winner) + '方胜' : '平局';
      this.dom.resultReason.textContent = st.winReason;
    }
  }

  function kv(label, value) {
    const row = document.createElement('div');
    row.className = 'kv';
    const a = document.createElement('span');
    a.textContent = label;
    const b = document.createElement('b');
    b.textContent = value;
    row.appendChild(a); row.appendChild(b);
    return row;
  }

  GVR.GameView = GameView;
})(typeof window !== 'undefined' ? window : globalThis);
