/* 对局状态：棋盘、回合、每方状态（按方隔离）、日志 */
(function (root) {
  'use strict';
  const GVR = root.GVR || (root.GVR = {});
  const B = GVR.Board;

  const SIDE_KEY = { 1: 'black', 2: 'white' };
  const SIDE_FROM_KEY = { black: 1, white: 2 };
  const SIDE_NAME = { 1: '黑方', 2: '白方' };

  function emptySide() {
    return {
      energy: 0, energyMin: 0, energyMax: 0,   // 能量 mod 写入
      captures: 0,                             // 围棋 mod 写入
      chainLen: 0,                             // 连珠 mod 写入
      combos: 0                                // 连打 mod 写入
    };
  }

  function create(size) {
    return {
      size,
      board: B.create(size),
      turn: B.BLACK,
      ended: false,
      winner: null,
      winReason: '',
      winLine: null,
      lastMove: null,
      moves: [],
      extraMoves: 0,      // 本回合剩余额外落子数（连打写入）
      turnActions: 0,
      moveMode: null,     // {side, cost, from:[x,y]} 移动子等待目标点
      sides: { black: emptySide(), white: emptySide() },
      log: []
    };
  }

  function sideOf(state, color) {
    return state.sides[SIDE_KEY[color]] || state.sides.black;
  }

  function log(state, text, kind) {
    state.log.push({ text, kind: kind || 'info', turn: state.moves.length });
    if (state.log.length > 200) state.log.shift();
  }

  GVR.State = { SIDE_KEY, SIDE_FROM_KEY, SIDE_NAME, create, sideOf, log };
})(typeof window !== 'undefined' ? window : globalThis);
