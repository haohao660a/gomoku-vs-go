/* 规则引擎验收测试：配置解析/模板、连珠、围棋提子、混合对局、能量/连打/移动子、归属方与仲裁 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '..');

const FILES = [
  'src/core/board.js',
  'src/core/state.js',
  'src/core/bus.js',
  'src/core/registry.js',
  'src/core/config.js',
  'src/core/arbiter.js',
  'src/mods/chain/index.js',
  'src/mods/go/index.js',
  'src/mods/energy/index.js',
  'src/mods/gain/index.js',
  'src/mods/combo/index.js',
  'src/mods/move/index.js',
  'src/mods/win/index.js',
  'templates/index.js',
  'src/core/engine.js'
];

for (const rel of FILES) {
  const code = fs.readFileSync(path.join(appDir, rel), 'utf8');
  vm.runInThisContext(code, { filename: rel });
}

const GVR = globalThis.GVR;
let passed = 0, failed = 0;
const fails = [];

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (e) {
    failed++;
    fails.push(name + ' → ' + e.message);
    console.log('  ✗ ' + name + ' → ' + e.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || '断言失败');
}

function makeDoc(text) {
  const doc = GVR.Config.parse(text);
  const errs = doc.errors.map((e) => '第' + e.no + '行 ' + e.msg);
  assert(!errs.length, '解析错误：' + errs.join('；'));
  return doc;
}

function makeEngine(text) {
  const engine = new GVR.Engine(makeDoc(text));
  engine.newGame();
  return engine;
}

function templateEngine(key) {
  return makeEngine(GVR.getTemplate(key).text);
}

/* ---------------- 配置与模板 ---------------- */

console.log('配置与模板');

check('4 个内置模板均可解析且规则组合正确', () => {
  const keys = ['gomoku', 'go30', 'mix', 'mix-energy'];
  const temps = keys.map((k) => GVR.getTemplate(k));
  assert(temps.every((t) => t && t.text), '模板缺失');
  const m = makeDoc(GVR.getTemplate('mix-energy').text);
  assert(m.mods.chain.enabled && m.mods.chain.owner === 'black', 'chain 应为黑方');
  assert(m.mods.go.enabled && m.mods.go.suicide === 'ban', '围棋应启用禁入');
  assert(m.mods.energy.enabled && m.mods.energy.owner === 'white', '能量应为白方');
  assert(m.mods.combo.enabled && m.mods.combo.cost === 5 && m.mods.combo.extra === 1, '连打参数错误');
  assert(m.mods.gain.enabled && m.mods.gain.amount === 1, '对方落子加能量参数错误');
  assert(!m.mods.move.enabled, '移动子默认关闭');
  assert(m.mods.win.enabled && m.mods.win.captureTarget === 10, '获胜目标错误');
  const g = makeDoc(GVR.getTemplate('go30').text);
  assert(g.mods.win.captureTarget === 30 && !g.mods.chain.enabled, '围棋模板错误');
});

check('配置错误能定位（未知模组 / 非法参数 / 非法归属方）', () => {
  const doc = GVR.Config.parse([
    'board = 15',
    'mod nope on',
    'mod chain on n=abc',
    'mod go on owner=黑'
  ].join('\n'));
  assert(doc.errors.length === 3, '应有 3 处错误，实际 ' + doc.errors.length);
});

check('配置序列化 → 解析可往返', () => {
  const doc = makeDoc(GVR.getTemplate('mix-energy').text);
  const round = GVR.Config.parse(GVR.Config.serialize(doc));
  assert(!round.errors.length, '序列化文本应可解析');
  for (const id of ['chain', 'go', 'energy', 'gain', 'combo', 'move', 'win']) {
    assert(round.mods[id].enabled === doc.mods[id].enabled, id + ' 启用状态不一致');
    assert(round.mods[id].owner === doc.mods[id].owner, id + ' 归属方不一致');
  }
  assert(round.mods.combo.cost === 5 && round.mods.gain.amount === 1, '参数未保留');
});

/* ---------------- 连珠 ---------------- */

console.log('连珠');

function playMoves(engine, seq) {
  for (const [color, x, y] of seq) {
    engine.state.turn = color;
    const res = engine.tryMove(x, y);
    assert(res.ok, '落子失败 (' + x + ',' + y + ')：' + res.error);
  }
}

check('普通五子棋：黑方连成 5 子获胜', () => {
  const e = templateEngine('gomoku');
  playMoves(e, [
    [1, 0, 0], [2, 0, 2],
    [1, 1, 0], [2, 1, 2],
    [1, 2, 0], [2, 2, 2],
    [1, 3, 0], [2, 3, 2],
    [1, 4, 0]
  ]);
  assert(e.state.ended, '对局应结束');
  assert(e.state.winner === 1, '黑方应获胜');
  assert(e.state.winReason.indexOf('5 连珠') >= 0, '获胜原因应包含连珠');
});

check('连珠参数 n 生效：n=4 时四连即胜', () => {
  const e = makeEngine('board = 15\nmod chain on owner=双方 n=4\nmod win on owner=双方');
  playMoves(e, [[1, 0, 0], [2, 0, 2], [1, 1, 0], [2, 1, 2], [1, 2, 0], [2, 2, 2], [1, 3, 0]]);
  assert(e.state.ended && e.state.winner === 1, '四连应获胜');
});

check('连珠归属方：仅黑方生效时白方五连不结束', () => {
  const e = makeEngine('board = 15\nmod chain on owner=黑 n=5\nmod win on owner=双方');
  playMoves(e, [[1, 0, 0], [2, 0, 2], [1, 1, 0], [2, 1, 2], [1, 2, 0], [2, 2, 2],
    [1, 3, 0], [2, 3, 2], [1, 9, 9], [2, 4, 2]]);
  assert(!e.state.ended, '白方五连不应获胜');
});

check('获胜规则关闭时不结算', () => {
  const e = makeEngine('board = 15\nmod chain on owner=双方 n=5\nmod win off');
  playMoves(e, [[1, 0, 0], [2, 0, 2], [1, 1, 0], [2, 1, 2], [1, 2, 0], [2, 2, 2],
    [1, 3, 0], [2, 3, 2], [1, 4, 0]]);
  assert(!e.state.ended, '获胜规则关闭时不应结束');
});

/* ---------------- 围棋 ---------------- */

console.log('围棋');

check('围棋提子：无气棋块被提，提子数累加', () => {
  const e = templateEngine('go30');
  e.state.board[0][0] = 1;   // 黑子 (0,0)
  e.state.board[1][0] = 2;   // 白子 (0,1)
  e.state.turn = 2;
  const res = e.tryMove(1, 0, 2);
  assert(res.ok, '落子失败：' + res.error);
  assert(e.state.board[0][0] === 0, '黑子应被提走');
  assert(e.state.sides.white.captures === 1, '白方提子数应为 1');
});

check('围棋提子达标：提满 30 子获胜', () => {
  const e = templateEngine('go30');
  e.state.sides.white.captures = 29;
  e.state.board[0][0] = 1;
  e.state.board[1][0] = 2;
  e.state.turn = 2;
  e.tryMove(1, 0, 2);
  assert(e.state.ended, '应结束');
  assert(e.state.winner === 2, '白方应获胜');
  assert(e.state.winReason.indexOf('30') >= 0, '原因应包含 30');
});

check('自杀禁入：无气点不可落子', () => {
  const e = templateEngine('mix');
  for (const [x, y] of [[0, 1], [1, 0], [2, 1], [1, 2]]) e.state.board[y][x] = 2;
  e.state.turn = 1;
  const res = e.tryMove(1, 1, 1);
  assert(!res.ok && res.error.indexOf('自杀') >= 0, '应被禁入：' + res.error);
  assert(e.state.board[1][1] === 0, '非法落子不应写盘');
});

check('自杀允许：同一空点可以落子', () => {
  const e = makeEngine('board = 15\nmod go on owner=双方 suicide=允许\nmod win on owner=双方');
  for (const [x, y] of [[0, 1], [1, 0], [2, 1], [1, 2]]) e.state.board[y][x] = 2;
  e.state.turn = 1;
  const res = e.tryMove(1, 1, 1);
  assert(res.ok, '允许自杀时应可落子：' + res.error);
  assert(e.state.board[1][1] === 1, '落子未写入');
});

/* ---------------- 混合对局 ---------------- */

console.log('混合对局');

check('五子棋对围棋：黑方五连获胜', () => {
  const e = templateEngine('mix');
  playMoves(e, [[1, 0, 0], [2, 0, 2], [1, 1, 0], [2, 1, 2], [1, 2, 0], [2, 2, 2],
    [1, 3, 0], [2, 3, 2], [1, 4, 0]]);
  assert(e.state.ended && e.state.winner === 1, '黑方五连应获胜');
  assert(e.state.sides.black.captures === 0, '提子数不应误记');
});

check('五子棋对围棋：白方提满 10 子获胜', () => {
  const e = templateEngine('mix');
  e.state.sides.white.captures = 9;
  e.state.board[0][0] = 1;
  e.state.board[1][0] = 2;
  e.state.turn = 2;
  e.tryMove(1, 0, 2);
  assert(e.state.ended && e.state.winner === 2, '白方提满 10 子应获胜');
});

/* ---------------- 能量 / 连打 / 移动子 ---------------- */

console.log('能量与动作');

const ENERGY_CFG = [
  'board = 15',
  'mod chain on owner=双方 n=5',
  'mod energy on owner=白 init=3 min=0 max=5',
  'mod gain on owner=白 amount=1',
  'mod win on owner=双方',
  'mod combo off',
  'mod move off',
  'mod go off'
].join('\n');

check('能量初始值与上限生效', () => {
  const e = makeEngine(ENERGY_CFG);
  assert(e.state.sides.white.energy === 3, '初始能量应为 3');
  assert(e.state.sides.white.energyMax === 5, '上限应为 5');
  assert(e.state.sides.black.energyMax === 0, '黑方不应有能量池');
});

check('对方落子加能量：黑方落子 → 白方 +1（不超过上限）', () => {
  const e = makeEngine(ENERGY_CFG);
  e.tryMove(0, 0);
  assert(e.state.sides.white.energy === 4, '白方能量应为 4，实际 ' + e.state.sides.white.energy);
  e.state.sides.white.energy = 5;
  e.state.turn = 1;
  e.tryMove(6, 6);
  assert(e.state.sides.white.energy === 5, '不应超过上限');
});

check('连打：消耗 5 能量 → 本回合额外落子 1 次（同方续下）', () => {
  const e = templateEngine('mix-energy');
  e.state.turn = 2;
  e.addEnergy(2, 5);
  assert(e.state.sides.white.energy === 5, '应补满 5 能量');
  const res = e.runAction(2, 'combo');
  assert(res.ok, '连打失败：' + res.error);
  assert(e.state.sides.white.energy === 0, '应扣 5 能量');
  assert(e.state.extraMoves === 1, '应有 1 次额外落子');
  e.tryMove(0, 4);
  assert(e.state.turn === 2, '连打后同方应继续落子');
  e.tryMove(1, 4);
  assert(e.state.turn === 1, '额外落子用完后应换方');
});

check('连打：能量不足时动作不可用', () => {
  const e = templateEngine('mix-energy');
  e.state.turn = 2;
  e.addEnergy(2, 4);
  const item = e.listActions(2).find((a) => a.id === 'combo');
  assert(item && item.available === false, '能量不足应显示不可用');
  assert(item.hint.indexOf('能量不足') >= 0, '提示应说明能量不足');
  const res = e.runAction(2, 'combo');
  assert(!res.ok, '能量不足时不应执行');
});

check('每回合次数限制：perTurn=1 时第二次连打不可用', () => {
  const e = templateEngine('mix-energy');
  e.state.turn = 2;
  e.addEnergy(2, 5);
  assert(e.runAction(2, 'combo').ok, '第一次连打应成功');
  const item = e.listActions(2).find((a) => a.id === 'combo');
  assert(item.available === false && item.hint.indexOf('次数') >= 0, '应提示次数已用完');
});

const MOVE_CFG = [
  'board = 15',
  'mod energy on owner=白 init=5 min=0 max=10',
  'mod move on owner=白 cost=2',
  'mod win on owner=双方',
  'mod chain off',
  'mod go off'
].join('\n');

check('移动子：消耗能量把对方棋子移到空点', () => {
  const e = makeEngine(MOVE_CFG);
  e.state.board[0][0] = 1;
  e.state.turn = 2;
  const start = e.runAction(2, 'move');
  assert(start.ok && start.pending === 'move', '应进入移动模式');
  const res = e.executeMove(2, [0, 0], [3, 3]);
  assert(res.ok, '移动失败：' + res.error);
  assert(e.state.board[0][0] === 0 && e.state.board[3][3] === 1, '棋子位置未更新');
  assert(e.state.sides.white.energy === 3, '应扣 2 能量');
  assert(e.state.turn === 2, '移动子不应结束回合');
});

check('移动子：非法目标被拒绝且不扣能量', () => {
  const e = makeEngine(MOVE_CFG);
  e.state.board[0][0] = 1;
  e.state.board[5][5] = 2;
  e.state.turn = 2;
  e.runAction(2, 'move');
  const res = e.executeMove(2, [0, 0], [5, 5]);
  assert(!res.ok && res.error.indexOf('已有棋子') >= 0, '应拒绝已占用目标：' + res.error);
  assert(e.state.sides.white.energy === 5, '失败不应扣能量');
});

check('移动子：能量不足时不可用', () => {
  const e = makeEngine(MOVE_CFG);
  e.state.sides.white.energy = 1;
  e.state.turn = 2;
  const item = e.listActions(2).find((a) => a.id === 'move');
  assert(item && item.available === false, '应显示不可用');
  assert(!e.runAction(2, 'move').ok, '不应执行');
});

check('动作按归属方隔离：能量/连打仅白方可见', () => {
  const e = templateEngine('mix-energy');
  e.state.turn = 1;
  assert(e.listActions(1).length === 0, '黑方不应有主动动作');
  assert(e.listActions(2).some((a) => a.id === 'combo'), '白方应有连打');
});

/* ---------------- 汇总 ---------------- */

console.log('\n通过 ' + passed + ' 项，失败 ' + failed + ' 项');
if (failed) {
  fails.forEach((f) => console.log(' - ' + f));
  process.exit(1);
}
