/* 棋盘几何：落子、气/提子、连珠扫描（纯函数，不依赖对局状态） */
(function (root) {
  'use strict';
  const GVR = root.GVR || (root.GVR = {});

  const EMPTY = 0, BLACK = 1, WHITE = 2;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const LINES = [[1, 0], [0, 1], [1, 1], [1, -1]];
  const DIR_SETS = {
    all: LINES,
    line: [[1, 0], [0, 1]],
    diag: [[1, 1], [1, -1]]
  };

  function create(size) {
    return Array.from({ length: size }, () => new Array(size).fill(EMPTY));
  }

  function inBounds(size, x, y) {
    return x >= 0 && y >= 0 && x < size && y < size;
  }

  function opponent(color) {
    return color === BLACK ? WHITE : BLACK;
  }

  function colorName(color) {
    return color === BLACK ? '黑' : color === WHITE ? '白' : '—';
  }

  /** 沿 (dx,dy) 双向扫描同色连子，cells 从负方向到正方向 */
  function lineRun(board, size, x, y, color, dx, dy) {
    const neg = [], pos = [];
    for (const s of [-1, 1]) {
      let nx = x + dx * s, ny = y + dy * s;
      while (inBounds(size, nx, ny) && board[ny][nx] === color) {
        (s < 0 ? neg : pos).push([nx, ny]);
        nx += dx * s; ny += dy * s;
      }
    }
    const cells = neg.reverse().concat([[x, y]], pos);
    return { length: cells.length, cells };
  }

  /**
   * 判断 (x,y) 处是否形成 n 连珠。
   * dirs: all | line | diag；mode: atLeast（≥n）| exact（恰好 n）
   */
  function chainInfo(board, size, x, y, color, n, dirs, mode) {
    const set = DIR_SETS[dirs] || DIR_SETS.all;
    for (const [dx, dy] of set) {
      const run = lineRun(board, size, x, y, color, dx, dy);
      if (mode === 'exact' ? run.length === n : run.length >= n) {
        return { ok: true, cells: run.cells, length: run.length, dir: [dx, dy] };
      }
    }
    return { ok: false, cells: [], length: 0, dir: null };
  }

  /** (x,y) 处棋块：{color, stones, liberties, libertyPoints} */
  function groupAt(board, size, x, y) {
    if (!inBounds(size, x, y)) return null;
    const color = board[y][x];
    if (color === EMPTY) return null;
    const stack = [[x, y]];
    const seen = new Set([x + ',' + y]);
    const stones = [];
    const libertyPoints = [];
    const libertySeen = new Set();
    while (stack.length) {
      const [cx, cy] = stack.pop();
      stones.push([cx, cy]);
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (!inBounds(size, nx, ny)) continue;
        const v = board[ny][nx];
        if (v === EMPTY) {
          const k = nx + ',' + ny;
          if (!libertySeen.has(k)) { libertySeen.add(k); libertyPoints.push([nx, ny]); }
        } else if (v === color) {
          const k = nx + ',' + ny;
          if (!seen.has(k)) { seen.add(k); stack.push([nx, ny]); }
        }
      }
    }
    return { color, stones, liberties: libertyPoints.length, libertyPoints };
  }

  /** 落子后因无气应被提走的对方棋块（不修改棋盘） */
  function findDeadGroups(board, size, x, y, color) {
    const opp = opponent(color);
    const out = [];
    const checked = new Set();
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(size, nx, ny) || board[ny][nx] !== opp) continue;
      const key = nx + ',' + ny;
      if (checked.has(key)) continue;
      const g = groupAt(board, size, nx, ny);
      g.stones.forEach(([sx, sy]) => checked.add(sx + ',' + sy));
      if (g.liberties === 0) out.push(g);
    }
    return out;
  }

  GVR.Board = {
    EMPTY, BLACK, WHITE, DIRS, LINES, DIR_SETS,
    create, inBounds, opponent, colorName,
    lineRun, chainInfo, groupAt, findDeadGroups
  };
})(typeof window !== 'undefined' ? window : globalThis);
