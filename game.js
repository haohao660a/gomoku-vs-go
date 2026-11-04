// 五子棋对围棋 - 核心规则逻辑（服务端权威）
// 棋盘 15x15。黑方按五子棋规则获胜（连五），白方按围棋规则获胜（提黑子达到 CAPTURE_TARGET 目）。
// 双方落子均适用围棋的气与提子规则：任何一方棋子无气则被提走；自杀手（落子后己方无气且未提子）为禁着点。

const SIZE = 15;
const EMPTY = 0, BLACK = 1, WHITE = 2;
const CAPTURE_TARGET = 10; // 白方获胜所需提掉的黑子数（目）

// 白方能量系统：共 10 格
const ENERGY_MAX = 10;          // 能量上限（格数）
const ENERGY_COST = 5;          // 使用一次额外落子的消耗
const ENERGY_PER_MOVE = 1;      // 白方每落一子获得的能量
const ENERGY_PER_FIVE = 5;      // 白方连成五子额外获得的能量

function createBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
}

function opponent(color) {
  return color === BLACK ? WHITE : BLACK;
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const LINES = [[1, 0], [0, 1], [1, 1], [1, -1]];

function inBoard(x, y) {
  return x >= 0 && y >= 0 && x < SIZE && y < SIZE;
}

// 获取 (x,y) 处棋子所属棋块及其气数
function getGroup(board, x, y) {
  const color = board[y][x];
  const stack = [[x, y]];
  const seen = new Set([x + ',' + y]);
  const stones = [];
  let liberties = 0;
  while (stack.length) {
    const [cx, cy] = stack.pop();
    stones.push([cx, cy]);
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!inBoard(nx, ny)) continue;
      const v = board[ny][nx];
      if (v === EMPTY) liberties++;
      else if (v === color && !seen.has(nx + ',' + ny)) {
        seen.add(nx + ',' + ny);
        stack.push([nx, ny]);
      }
    }
  }
  return { stones, liberties };
}

// 检查 (x,y) 处刚落下的 color 子是否形成五连，返回连线端点或 null
function checkFive(board, x, y, color) {
  for (const [dx, dy] of LINES) {
    let count = 1;
    const cells = [[x, y]];
    for (const s of [1, -1]) {
      let nx = x + dx * s, ny = y + dy * s;
      while (inBoard(nx, ny) && board[ny][nx] === color) {
        cells.push([nx, ny]);
        count++;
        nx += dx * s; ny += dy * s;
      }
    }
    if (count >= 5) return cells;
  }
  return null;
}

/**
 * 尝试落子。state: { board, turn, capturesByWhite, capturesByBlack, winner, winLine }
 * 返回 { ok, error?, captured?, winLine? }，成功时直接修改 state。
 */
function applyMove(state, color, x, y) {
  if (state.winner) return { ok: false, error: '对局已结束' };
  if (state.turn !== color) return { ok: false, error: '还没轮到你' };
  if (!inBoard(x, y)) return { ok: false, error: '超出棋盘' };
  if (state.board[y][x] !== EMPTY) return { ok: false, error: '该点已有棋子' };

  const board = state.board;
  const opp = opponent(color);
  board[y][x] = color;

  // 提走所有因这手棋而无气的对方棋块
  const captured = [];
  const checked = new Set();
  for (const [dx, dy] of DIRS) {
    const nx = x + dx, ny = y + dy;
    if (!inBoard(nx, ny) || board[ny][nx] !== opp) continue;
    const key = nx + ',' + ny;
    if (checked.has(key)) continue;
    const g = getGroup(board, nx, ny);
    g.stones.forEach(([sx, sy]) => checked.add(sx + ',' + sy));
    if (g.liberties === 0) {
      for (const [sx, sy] of g.stones) {
        board[sy][sx] = EMPTY;
        captured.push([sx, sy]);
      }
    }
  }

  // 自杀禁着：己方棋块无气且未提掉任何对方棋子
  const self = getGroup(board, x, y);
  if (self.liberties === 0 && captured.length === 0) {
    board[y][x] = EMPTY;
    return { ok: false, error: '禁着点（落子后己方无气）' };
  }

  if (color === WHITE) state.capturesByWhite += captured.length;
  else state.capturesByBlack += captured.length;

  // 白方能量累积：每落一子 +1，连成五子再 +5
  let fiveBonus = false;
  if (color === WHITE) {
    state.energy = Math.min(ENERGY_MAX, (state.energy || 0) + ENERGY_PER_MOVE);
    if (checkFive(board, x, y, WHITE)) {
      fiveBonus = true;
      state.energy = Math.min(ENERGY_MAX, state.energy + ENERGY_PER_FIVE);
    }
  }

  // 胜负判定
  let winLine = null;
  if (color === BLACK) {
    winLine = checkFive(board, x, y, BLACK);
    if (winLine) {
      state.winner = BLACK;
      state.winLine = winLine;
    }
  } else if (state.capturesByWhite >= CAPTURE_TARGET) {
    state.winner = WHITE;
  }

  if (!state.winner) {
    if (color === WHITE && (state.extraMoves || 0) > 0) {
      // 消耗一次额外落子，本回合继续由白方下
      state.extraMoves -= 1;
      state.turn = WHITE;
    } else {
      state.turn = opp;
      if (state.turn === WHITE) {
        // 新的白方回合：重置每回合限一次的使用状态
        state.extraUsed = false;
        state.extraMoves = 0;
      }
    }
  }
  state.lastMove = { x, y };
  return { ok: true, captured, winLine, fiveBonus };
}

/**
 * 白方消耗 5 格能量获得一次额外落子。每回合（白方一次行动）限一次。
 */
function useEnergy(state, color) {
  if (color !== WHITE) return { ok: false, error: '只有白方可以使用能量' };
  if (state.winner) return { ok: false, error: '对局已结束' };
  if (state.turn !== WHITE) return { ok: false, error: '还没轮到你' };
  if ((state.energy || 0) < ENERGY_COST) return { ok: false, error: `能量不足（需 ${ENERGY_COST} 格）` };
  if (state.extraUsed) return { ok: false, error: '本回合已使用过额外落子' };
  state.energy -= ENERGY_COST;
  state.extraUsed = true;
  state.extraMoves = (state.extraMoves || 0) + 1;
  return { ok: true };
}

module.exports = {
  SIZE, EMPTY, BLACK, WHITE, CAPTURE_TARGET,
  ENERGY_MAX, ENERGY_COST, ENERGY_PER_MOVE, ENERGY_PER_FIVE,
  createBoard, applyMove, useEnergy, opponent
};
