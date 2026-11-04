/* 围棋：包围对方棋块即提子；自杀禁入可开关（棋盘机制，双方生效） */
(function (root) {
  'use strict';
  const GVR = root.GVR || (root.GVR = {});
  const B = GVR.Board, State = GVR.State;

  GVR.registerMod({
    id: 'go',
    label: '围棋',
    group: '落子规则',
    summary: '气与提子规则；开启禁入后，落子后无气且未提子的点不可下。提子数可供获胜规则使用。',
    order: 20,
    scope: 'board',
    defaults: { enabled: false, owner: 'both' },
    params: [
      { key: 'suicide', label: '自杀禁入', type: 'select', default: 'ban',
        options: [{ value: 'ban', label: '禁入' }, { value: 'allow', label: '允许' }] }
    ],

    validatePlace(ctx) {
      if (ctx.cfg.suicide !== 'ban') return null;
      const { state } = ctx;
      state.board[ctx.y][ctx.x] = ctx.color;
      const own = B.groupAt(state.board, state.size, ctx.x, ctx.y);
      const dead = B.findDeadGroups(state.board, state.size, ctx.x, ctx.y, ctx.color);
      state.board[ctx.y][ctx.x] = B.EMPTY;
      if (own && own.liberties === 0 && dead.length === 0) {
        return { error: '自杀禁入：该点落子后无气' };
      }
      return null;
    },

    afterPlace(ctx) {
      const { state } = ctx;
      const dead = B.findDeadGroups(state.board, state.size, ctx.x, ctx.y, ctx.color);
      if (!dead.length) return;
      const capturer = State.SIDE_KEY[ctx.color];
      let count = 0;
      for (const group of dead) {
        for (const [sx, sy] of group.stones) {
          if (state.board[sy][sx] === B.EMPTY) continue;
          state.board[sy][sx] = B.EMPTY;
          ctx.captured.push([sx, sy]);
          count += 1;
        }
      }
      state.sides[capturer].captures += count;
      State.log(state, B.colorName(ctx.color) + '方提子 ' + count + ' 颗（累计 ' + state.sides[capturer].captures + '）', 'capture');
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
