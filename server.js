// 五子棋对围棋 - 服务端：静态托管 + Socket.io 房间对战
const path = require('path');
const os = require('os');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const G = require('./game');

const PORT = process.env.PORT || 3210;

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server);

/**
 * rooms: Map<roomId, {
 *   id, board, turn, winner, winLine, lastMove,
 *   capturesByWhite, capturesByBlack, started,
 *   players: { black: {pid,name,socketId,online}|null, white: {...}|null },
 *   rematch: Set<pid>, gcTimer
 * }>
 */
const rooms = new Map();

function genRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id;
  do {
    id = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(id));
  return id;
}

function newRoomState(id) {
  return {
    id,
    board: G.createBoard(),
    turn: G.BLACK, // 黑方先行
    winner: null,
    winLine: null,
    lastMove: null,
    capturesByWhite: 0,
    capturesByBlack: 0,
    energy: 0,        // 白方能量（格）
    extraMoves: 0,    // 白方待用的额外落子次数
    extraUsed: false, // 本回合是否已用过能量
    started: false,
    players: { black: null, white: null },
    rematch: new Set(),
    gcTimer: null
  };
}

function publicState(room) {
  return {
    roomId: room.id,
    board: room.board,
    turn: room.turn,
    winner: room.winner,
    winLine: room.winLine,
    lastMove: room.lastMove,
    capturesByWhite: room.capturesByWhite,
    capturesByBlack: room.capturesByBlack,
    energy: room.energy,
    extraMoves: room.extraMoves,
    extraUsed: room.extraUsed,
    energyMax: G.ENERGY_MAX,
    energyCost: G.ENERGY_COST,
    started: room.started,
    target: G.CAPTURE_TARGET,
    rematch: [...room.rematch],
    players: {
      black: room.players.black && { pid: room.players.black.pid, name: room.players.black.name, online: room.players.black.online },
      white: room.players.white && { pid: room.players.white.pid, name: room.players.white.name, online: room.players.white.online }
    }
  };
}

function broadcastState(room) {
  io.to(room.id).emit('state', publicState(room));
}

function colorOf(room, pid) {
  if (room.players.black && room.players.black.pid === pid) return G.BLACK;
  if (room.players.white && room.players.white.pid === pid) return G.WHITE;
  return null;
}

function scheduleGC(room) {
  clearTimeout(room.gcTimer);
  room.gcTimer = setTimeout(() => {
    const b = room.players.black, w = room.players.white;
    if ((!b || !b.online) && (!w || !w.online)) rooms.delete(room.id);
  }, 10 * 60 * 1000); // 双方离线 10 分钟后回收房间
}

function slotKey(color) {
  return color === G.BLACK ? 'black' : 'white';
}

/**
 * 按偏好选择空位：side 为 'black' | 'white' | 'auto'。
 * 偏好位置已被占则退回剩余空位；两个位置都满返回 null。
 */
function chooseSlot(room, side) {
  const wanted = side === 'black' ? G.BLACK : side === 'white' ? G.WHITE : null;
  if (wanted && !room.players[slotKey(wanted)]) return wanted;
  if (!room.players.black) return G.BLACK;
  if (!room.players.white) return G.WHITE;
  return null;
}

// 玩家离开当前房间（主动 leave 或开新房间前调用）
function leaveCurrentRoom(socket, silent) {
  const roomId = socket.data.roomId;
  const pid = socket.data.pid;
  if (!roomId || !rooms.has(roomId)) return;
  const room = rooms.get(roomId);
  const color = colorOf(room, pid);
  if (color === G.BLACK) room.players.black = null;
  else if (color === G.WHITE) room.players.white = null;
  socket.leave(roomId);
  socket.data.roomId = null;
  if (!room.players.black && !room.players.white) {
    clearTimeout(room.gcTimer);
    rooms.delete(roomId);
  } else {
    room.rematch.clear();
    if (!silent) broadcastState(room);
  }
}

io.on('connection', (socket) => {

  // 创建房间：按所选执子方入座（默认黑方/五子棋方）
  socket.on('create', ({ name, pid, side }, cb) => {
    name = String(name || '').trim().slice(0, 16);
    pid = String(pid || '').trim().slice(0, 16);
    if (!name || !pid) return cb && cb({ ok: false, error: '昵称与ID不能为空' });
    leaveCurrentRoom(socket);
    const id = genRoomId();
    const room = newRoomState(id);
    const color = chooseSlot(room, side) || G.BLACK;
    room.players[slotKey(color)] = { pid, name, socketId: socket.id, online: true };
    rooms.set(id, room);
    socket.join(id);
    socket.data.roomId = id;
    socket.data.pid = pid;
    cb && cb({ ok: true, roomId: id, color });
    broadcastState(room);
  });

  // 加入房间：优先按所选执子方入座，偏好位置被占则取剩余空位；同 pid 断线可重连回原位置
  socket.on('join', ({ roomId, name, pid, side }, cb) => {
    roomId = String(roomId || '').trim().toUpperCase();
    name = String(name || '').trim().slice(0, 16);
    pid = String(pid || '').trim().slice(0, 16);
    if (!name || !pid) return cb && cb({ ok: false, error: '昵称与ID不能为空' });
    const room = rooms.get(roomId);
    if (!room) return cb && cb({ ok: false, error: '房间不存在' });

    const existingColor = colorOf(room, pid);
    leaveCurrentRoom(socket);
    socket.data.pid = pid;

    if (existingColor) {
      // 重连回原位置
      const p = existingColor === G.BLACK ? room.players.black : room.players.white;
      p.socketId = socket.id;
      p.online = true;
      p.name = name;
      clearTimeout(room.gcTimer);
      socket.join(roomId);
      socket.data.roomId = roomId;
      cb && cb({ ok: true, roomId, color: existingColor, rejoin: true });
      return broadcastState(room);
    }
    const color = chooseSlot(room, side);
    if (!color) return cb && cb({ ok: false, error: '房间已满' });

    room.players[slotKey(color)] = { pid, name, socketId: socket.id, online: true };
    room.started = !!(room.players.black && room.players.white);
    clearTimeout(room.gcTimer);
    socket.join(roomId);
    socket.data.roomId = roomId;
    cb && cb({ ok: true, roomId, color, switched: side && side !== 'auto' && color !== (side === 'black' ? G.BLACK : G.WHITE) });
    broadcastState(room);
  });

  // 落子
  socket.on('move', ({ x, y }, cb) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return cb && cb({ ok: false, error: '不在房间中' });
    if (!room.started) return cb && cb({ ok: false, error: '等待对手加入' });
    const color = colorOf(room, socket.data.pid);
    if (!color) return cb && cb({ ok: false, error: '你不是对局玩家' });
    const res = G.applyMove(room, color, x | 0, y | 0);
    if (!res.ok) return cb && cb(res);
    room.rematch.clear();
    cb && cb({ ok: true });
    broadcastState(room);
  });

  // 白方消耗能量获得额外落子
  socket.on('useEnergy', (cb) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return cb && cb({ ok: false, error: '不在房间中' });
    if (!room.started) return cb && cb({ ok: false, error: '等待对手加入' });
    const color = colorOf(room, socket.data.pid);
    if (!color) return cb && cb({ ok: false, error: '你不是对局玩家' });
    const res = G.useEnergy(room, color);
    if (!res.ok) return cb && cb(res);
    cb && cb({ ok: true });
    broadcastState(room);
  });

  // 认输
  socket.on('resign', (cb) => {
    const room = rooms.get(socket.data.roomId);
    if (!room || !room.started || room.winner) return cb && cb({ ok: false, error: '无法认输' });
    const color = colorOf(room, socket.data.pid);
    if (!color) return cb && cb({ ok: false, error: '你不是对局玩家' });
    room.winner = G.opponent(color);
    cb && cb({ ok: true });
    broadcastState(room);
  });

  // 再来一局：双方确认后重置
  socket.on('rematch', (cb) => {
    const room = rooms.get(socket.data.roomId);
    if (!room || !room.winner) return cb && cb({ ok: false, error: '对局未结束' });
    const pid = socket.data.pid;
    if (!colorOf(room, pid)) return cb && cb({ ok: false, error: '你不是对局玩家' });
    room.rematch.add(pid);
    if (room.rematch.size >= 2) {
      const fresh = newRoomState(room.id);
      fresh.players = room.players;
      fresh.started = room.players.black && room.players.white &&
        room.players.black.online && room.players.white.online;
      rooms.set(room.id, fresh);
      cb && cb({ ok: true });
      broadcastState(fresh);
    } else {
      cb && cb({ ok: true });
      broadcastState(room);
    }
  });

  // 离开房间
  socket.on('leave', () => leaveCurrentRoom(socket));

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    const pid = socket.data.pid;
    const room = roomId && rooms.get(roomId);
    if (!room) return;
    const color = colorOf(room, pid);
    if (color) {
      const p = color === G.BLACK ? room.players.black : room.players.white;
      if (p.socketId === socket.id) {
        p.online = false;
        broadcastState(room);
      }
      scheduleGC(room);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  console.log(`五子棋对围棋 服务已启动:`);
  console.log(`  本机访问: http://localhost:${PORT}`);
  ips.forEach(ip => console.log(`  局域网访问: http://${ip}:${PORT}`));
});
