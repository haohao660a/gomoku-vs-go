// 五子棋对围棋 - 前端逻辑
/* global io */

// ---------- 身份：昵称 + 本机持久化 ID ----------
const BLACK = 1, WHITE = 2;
const LS = {
  get pid() { return localStorage.getItem('gvg_pid'); },
  set pid(v) { localStorage.setItem('gvg_pid', v); },
  get name() { return localStorage.getItem('gvg_name') || ''; },
  set name(v) { localStorage.setItem('gvg_name', v); },
  get room() { return localStorage.getItem('gvg_room') || ''; },
  set room(v) { v ? localStorage.setItem('gvg_room', v) : localStorage.removeItem('gvg_room'); },
  get side() { return localStorage.getItem('gvg_side') || 'auto'; },
  set side(v) { localStorage.setItem('gvg_side', v); }
};

if (!LS.pid) LS.pid = String(Math.floor(100000 + Math.random() * 900000)); // 6位ID

const $ = (id) => document.getElementById(id);
const nameInput = $('nameInput'), pidText = $('pidText'), roomInput = $('roomInput');
const homeEl = $('home'), gameEl = $('game'), board = $('board'), ctx = board.getContext('2d');

pidText.textContent = LS.pid;
nameInput.value = LS.name;

// URL ?room=XXXX 自动填入房间码
const urlRoom = new URLSearchParams(location.search).get('room');
if (urlRoom) roomInput.value = urlRoom.toUpperCase().slice(0, 4);

let socket = null;
let state = null;      // 服务端广播的对局状态
let myColor = null;    // 我方颜色 1黑/2白
let hoverCell = null;  // 鼠标悬停的交叉点
let reconnectTimer = null;

// ---------- Toast ----------
let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
}

// ---------- Socket ----------
function connect() {
  socket = io();

  socket.on('connect', () => {
    // 断线自动重连后尝试回原房间
    if (LS.room && LS.name) {
      socket.emit('join', { roomId: LS.room, name: LS.name, pid: LS.pid }, (res) => {
        if (res.ok) {
          myColor = res.color;
          showGame();
        } else {
          LS.room = '';
        }
      });
    }
  });

  socket.on('state', (s) => {
    state = s;
    if (s.players.black && s.players.black.pid === LS.pid) myColor = BLACK;
    else if (s.players.white && s.players.white.pid === LS.pid) myColor = WHITE;
    renderAll();
  });
}

function showHome() {
  gameEl.classList.add('hidden');
  homeEl.classList.remove('hidden');
}
function showGame() {
  homeEl.classList.add('hidden');
  gameEl.classList.remove('hidden');
  resizeBoard();
}

// ---------- 首页操作 ----------
$('copyPidBtn').onclick = () => {
  navigator.clipboard.writeText(LS.pid).then(() => toast('ID 已复制'));
};

function requireName() {
  const name = nameInput.value.trim();
  if (!name) { toast('请先输入昵称'); nameInput.focus(); return null; }
  LS.name = name;
  return name;
}

// ---------- 执子方偏好 ----------
let preferredSide = ['auto', 'black', 'white'].includes(LS.side) ? LS.side : 'auto';
function setPreferredSide(side) {
  preferredSide = side;
  LS.side = side;
  document.querySelectorAll('#sideSelect .side-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.side === side);
  });
}
document.querySelectorAll('#sideSelect .side-btn').forEach((b) => {
  b.addEventListener('click', () => setPreferredSide(b.dataset.side));
});
setPreferredSide(preferredSide);

$('createBtn').onclick = () => {
  const name = requireName();
  if (!name) return;
  socket.emit('create', { name, pid: LS.pid, side: preferredSide }, (res) => {
    if (!res.ok) return toast(res.error);
    myColor = res.color;
    LS.room = res.roomId;
    showGame();
    toast(`房间已创建，你执${res.color === BLACK ? '黑（五子棋）' : '白（围棋）'}，等待对手加入`);
  });
};

$('joinBtn').onclick = () => {
  const name = requireName();
  if (!name) return;
  const roomId = roomInput.value.trim().toUpperCase();
  if (roomId.length !== 4) return toast('请输入 4 位房间码');
  socket.emit('join', { roomId, name, pid: LS.pid, side: preferredSide }, (res) => {
    if (!res.ok) return toast(res.error);
    myColor = res.color;
    LS.room = res.roomId;
    showGame();
    if (res.switched) toast(`所选位置已被占用，你改执${res.color === BLACK ? '黑（五子棋）' : '白（围棋）'}`);
    else toast(`你执${res.color === BLACK ? '黑（五子棋）' : '白（围棋）'}`);
  });
};

// ---------- 对局操作 ----------
$('copyRoomBtn').onclick = () => {
  const link = location.origin + '?room=' + state.roomId;
  navigator.clipboard.writeText(link).then(() => toast('邀请链接已复制'));
};

function doLeave() {
  if (socket) socket.emit('leave');
  LS.room = '';
  state = null;
  myColor = null;
  $('overlay').classList.add('hidden');
  showHome();
}
$('leaveBtn').onclick = doLeave;
$('overlayLeaveBtn').onclick = doLeave;

$('resignBtn').onclick = () => {
  if (!state || state.winner || !state.started) return;
  if (confirm('确定认输吗？')) socket.emit('resign', (res) => { if (!res.ok) toast(res.error); });
};

$('rematchBtn').onclick = () => {
  socket.emit('rematch', (res) => {
    if (!res.ok) return toast(res.error);
    $('rematchBtn').disabled = true;
    $('rematchBtn').textContent = '等待对方确认…';
  });
};

// ---------- 棋盘绘制 ----------
const SIZE = 15;
const STARS = [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]];
let cell = 0, pad = 0;

function resizeBoard() {
  const maxW = Math.min(window.innerWidth - 40, 620);
  const maxH = window.innerHeight - 260;
  const side = Math.max(300, Math.min(maxW, maxH));
  const dpr = window.devicePixelRatio || 1;
  board.style.width = board.style.height = side + 'px';
  board.width = board.height = side * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  pad = Math.round(side * 0.055);
  cell = (side - pad * 2) / (SIZE - 1);
  drawBoard();
}

function cellXY(x, y) {
  return [pad + x * cell, pad + y * cell];
}

function drawBoard() {
  if (!gameEl || gameEl.classList.contains('hidden')) return;
  const side = board.width / (window.devicePixelRatio || 1);

  // 棋盘底色
  ctx.fillStyle = '#dfb473';
  ctx.fillRect(0, 0, side, side);

  // 网格线
  ctx.strokeStyle = '#8a6a3c';
  ctx.lineWidth = 1;
  for (let i = 0; i < SIZE; i++) {
    const [x1, y1] = cellXY(0, i), [x2] = cellXY(SIZE - 1, i);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y1); ctx.stroke();
    const [ax, ay] = cellXY(i, 0), [, by] = cellXY(i, SIZE - 1);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax, by); ctx.stroke();
  }

  // 星位
  ctx.fillStyle = '#8a6a3c';
  for (const [sx, sy] of STARS) {
    const [cx, cy] = cellXY(sx, sy);
    ctx.beginPath(); ctx.arc(cx, cy, cell * 0.09, 0, Math.PI * 2); ctx.fill();
  }

  const b = state ? state.board : null;

  // 悬停预览
  if (hoverCell && b && !state.winner && state.started && state.turn === myColor
      && b[hoverCell.y][hoverCell.x] === 0) {
    const [cx, cy] = cellXY(hoverCell.x, hoverCell.y);
    ctx.globalAlpha = 0.45;
    drawStone(cx, cy, myColor);
    ctx.globalAlpha = 1;
  }

  // 棋子
  if (b) {
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++)
        if (b[y][x] !== 0) {
          const [cx, cy] = cellXY(x, y);
          drawStone(cx, cy, b[y][x]);
        }
  }

  // 最后一手标记
  if (state && state.lastMove) {
    const [cx, cy] = cellXY(state.lastMove.x, state.lastMove.y);
    ctx.strokeStyle = '#d04030';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, cell * 0.16, 0, Math.PI * 2); ctx.stroke();
  }

  // 胜利连线
  if (state && state.winLine) {
    ctx.strokeStyle = 'rgba(208,64,48,.9)';
    ctx.lineWidth = 3;
    const line = state.winLine;
    const [fx, fy] = cellXY(line[0][0], line[0][1]);
    const [lx, ly] = cellXY(line[line.length - 1][0], line[line.length - 1][1]);
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(lx, ly); ctx.stroke();
  }
}

function drawStone(cx, cy, color) {
  const r = cell * 0.44;
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
  if (color === BLACK) { g.addColorStop(0, '#5a5a5a'); g.addColorStop(1, '#0a0a0a'); }
  else { g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#c5bfb2'); }
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
}

// ---------- 棋盘交互 ----------
function eventCell(e) {
  const rect = board.getBoundingClientRect();
  const px = e.clientX - rect.left, py = e.clientY - rect.top;
  const x = Math.round((px - pad) / cell), y = Math.round((py - pad) / cell);
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return null;
  const [cx, cy] = cellXY(x, y);
  if (Math.hypot(px - cx, py - cy) > cell * 0.5) return null;
  return { x, y };
}

board.addEventListener('mousemove', (e) => {
  const c = eventCell(e);
  if ((c && !hoverCell) || (!c && hoverCell) || (c && hoverCell && (c.x !== hoverCell.x || c.y !== hoverCell.y))) {
    hoverCell = c;
    drawBoard();
  }
});
board.addEventListener('mouseleave', () => { hoverCell = null; drawBoard(); });

board.addEventListener('click', (e) => {
  if (!state) return;
  if (!state.started) return toast('等待对手加入');
  if (state.winner) return;
  if (state.turn !== myColor) return toast('还没轮到你');
  const c = eventCell(e);
  if (!c) return;
  socket.emit('move', c, (res) => { if (!res.ok) toast(res.error); });
});

// ---------- 白方能量条 ----------
let energyCellsBuilt = false;
function buildEnergyCells() {
  const bar = $('energyBar');
  bar.innerHTML = '';
  for (let i = 0; i < 10; i++) {
    const c = document.createElement('div');
    c.className = 'energy-cell';
    bar.appendChild(c);
  }
  energyCellsBuilt = true;
}

$('energyBar').addEventListener('click', () => {
  if (!state || !canUseEnergy()) {
    if (!state || state.winner) return;
    if (myColor !== WHITE) return toast('只有白方可以充能使用能量');
    if (state.turn !== WHITE) return toast('还没轮到你');
    if (state.energy < state.energyCost) return toast(`能量不足（需 ${state.energyCost} 格）`);
    if (state.extraUsed) return toast('本回合已使用过额外落子');
    return;
  }
  socket.emit('useEnergy', (res) => {
    if (!res.ok) return toast(res.error);
    const bar = $('energyBar');
    bar.classList.add('spending');
    setTimeout(() => bar.classList.remove('spending'), 500);
    toast(`消耗 ${state.energyCost} 格能量，获得一次额外落子`);
  });
});

function canUseEnergy() {
  return !!state && state.started && !state.winner && myColor === WHITE &&
    state.turn === WHITE && state.energy >= state.energyCost && !state.extraUsed;
}

function renderEnergy() {
  if (!energyCellsBuilt) buildEnergyCells();
  if (!state) return;
  const max = state.energyMax || 10;
  const bar = $('energyBar');
  const cells = bar.querySelectorAll('.energy-cell');
  cells.forEach((c, i) => c.classList.toggle('filled', i < state.energy));

  const usable = canUseEnergy();
  bar.classList.toggle('usable', usable);
  const tip = $('energyTip');
  let text = `能量 ${state.energy}/${max} · 每黑方落子 +1`;
  if (myColor === WHITE && state.turn === WHITE) {
    if (state.extraMoves > 0) text = `能量 ${state.energy}/${max} · 额外落子待用`;
    else if (state.extraUsed) text = `能量 ${state.energy}/${max} · 本回合已使用`;
    else if (state.energy >= state.energyCost) text = `能量 ${state.energy}/${max} · 点击消耗 ${state.energyCost} 格`;
  }
  tip.textContent = text;
  tip.classList.toggle('active', usable || (myColor === WHITE && state.extraMoves > 0));
}

// ---------- 渲染状态面板 ----------
function renderAll() {
  if (!state) return;
  $('roomCode').textContent = state.roomId;
  $('blackCap').textContent = state.capturesByBlack;
  $('whiteCap').textContent = state.capturesByWhite;
  $('whiteTarget').textContent = state.target;
  $('targetText').textContent = state.target;

  for (const [color, cardId] of [[BLACK, 'blackCard'], [WHITE, 'whiteCard']]) {
    const card = $(cardId);
    const p = color === BLACK ? state.players.black : state.players.white;
    const nameEl = card.querySelector('.pname');
    if (p) {
      nameEl.innerHTML = escapeHtml(p.name) + (p.pid === LS.pid ? ' <span class="me-tag">(我)</span>' : '') +
        (p.online ? '' : ' <span class="me-tag">[离线]</span>');
      card.classList.toggle('offline', !p.online);
    } else {
      nameEl.textContent = '虚位以待';
      card.classList.remove('offline');
    }
    card.classList.toggle('active', !!state.started && !state.winner && state.turn === color);
  }

  // 状态文字
  const status = $('statusText');
  if (!state.started) {
    status.textContent = '等待对手加入…';
    status.className = 'status';
  } else if (state.winner) {
    const winName = state.winner === BLACK ? '黑方（五子棋）' : '白方（围棋）';
    status.textContent = winName + ' 获胜！';
    status.className = 'status';
  } else {
    const mine = state.turn === myColor;
    let txt = mine ? '轮到你了' : '对手思考中…';
    if (mine && myColor === WHITE && state.extraMoves > 0) txt += '（额外落子）';
    else if (mine && myColor === WHITE && state.energy >= state.energyCost && !state.extraUsed) {
      txt += `（可消耗 ${state.energyCost} 格能量追加一手）`;
    }
    status.textContent = txt;
    status.className = 'status' + (mine ? ' my-turn' : '');
  }

  renderEnergy();

  // 结束覆盖层
  const overlay = $('overlay');
  if (state.winner) {
    overlay.classList.remove('hidden');
    const winSide = state.winner === BLACK ? '黑方 · 五子棋' : '白方 · 围棋';
    const reason = state.winner === BLACK ? '五子连珠' : `提子 ${state.target} 目`;
    const iWin = state.winner === myColor;
    $('resultText').textContent = (iWin ? '🎉 你赢了！' : '你输了') + `（${winSide} · ${reason}）`;
    const btn = $('rematchBtn');
    btn.disabled = state.rematch.includes(LS.pid);
    btn.textContent = state.rematch.includes(LS.pid) ? '等待对方确认…' :
      (state.rematch.length > 0 ? '再来一局（对方已确认）' : '再来一局');
  } else {
    overlay.classList.add('hidden');
  }

  drawBoard();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

window.addEventListener('resize', resizeBoard);

// ---------- 启动 ----------
connect();
showHome();
