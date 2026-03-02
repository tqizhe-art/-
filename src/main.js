import { COLS, ROWS, pieceText } from './constants.js';
import { createInitialBoard, cloneBoard, getLegalMoves, isInCheck, hasAnyLegalMove } from './rules.js';
import { moveToChineseNotation } from './notation.js';
import { loadState, saveState } from './storage.js';

const $ = (id) => document.getElementById(id);
const boardEl = $('board');
const gridEl = $('grid');
const overlayEl = $('overlay');
const statusEl = $('status');
const logEl = $('log');
const timerREl = $('timer-r');
const timerBEl = $('timer-b');

const undoBtn = $('undoBtn');
const saveBtn = $('saveBtn');
const loadBtn = $('loadBtn');
const drawBtn = $('drawBtn');
const resignBtn = $('resignBtn');
const resetBtn = $('resetBtn');

const state = {
  board: createInitialBoard(),
  turn: 'r',
  selected: null,
  legalTargets: [],
  history: [],
  logs: [{ type: 'meta', text: '开局：红方先行。' }],
  moveList: [],
  lastMove: null,
  gameOver: false,
  winner: null,
  timers: { r: 0, b: 0 },
  activeTimer: 'r',
  timerId: null
};

const BOARD_INSET_RATIO = 0.06;

function mapPoint(index, maxIndex, size) {
  const inset = size * BOARD_INSET_RATIO;
  const usable = size - inset * 2;
  return inset + (index / maxIndex) * usable;
}

function boardPixel(r, c) {
  const rect = boardEl.getBoundingClientRect();
  return {
    x: mapPoint(c, COLS - 1, rect.width),
    y: mapPoint(r, ROWS - 1, rect.height)
  };
}

function drawBoardGrid() {
  const W = 100, H = 100;
  const x = (c) => mapPoint(c, COLS - 1, W);
  const y = (r) => mapPoint(r, ROWS - 1, H);
  const line = (x1, y1, x2, y2) => {
    const e = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    e.setAttribute('x1', x1); e.setAttribute('y1', y1);
    e.setAttribute('x2', x2); e.setAttribute('y2', y2);
    e.setAttribute('stroke', '#4c2f12'); e.setAttribute('stroke-width', '1.2');
    gridEl.appendChild(e);
  };
  gridEl.innerHTML = '';
  for (let r = 0; r < ROWS; r++) line(x(0), y(r), x(COLS - 1), y(r));
  for (let c = 0; c < COLS; c++) {
    if (c === 0 || c === COLS - 1) line(x(c), y(0), x(c), y(ROWS - 1));
    else {
      line(x(c), y(0), x(c), y(4));
      line(x(c), y(5), x(c), y(ROWS - 1));
    }
  }
  line(x(3), y(0), x(5), y(2));
  line(x(5), y(0), x(3), y(2));
  line(x(3), y(7), x(5), y(9));
  line(x(5), y(7), x(3), y(9));
}

function formatSec(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function updateTimersUI() {
  timerREl.textContent = formatSec(state.timers.r);
  timerBEl.textContent = formatSec(state.timers.b);
  timerREl.parentElement.classList.toggle('active', !state.gameOver && state.activeTimer === 'r');
  timerBEl.parentElement.classList.toggle('active', !state.gameOver && state.activeTimer === 'b');
}

function startTimer() {
  if (state.timerId) clearInterval(state.timerId);
  state.timerId = setInterval(() => {
    if (state.gameOver) return;
    state.timers[state.activeTimer] += 1;
    updateTimersUI();
  }, 1000);
}

function switchTurn() {
  state.turn = state.turn === 'r' ? 'b' : 'r';
  state.activeTimer = state.turn;
}

function pushHistory() {
  state.history.push({
    board: cloneBoard(state.board),
    turn: state.turn,
    selected: state.selected,
    legalTargets: state.legalTargets.map(m => [...m]),
    lastMove: state.lastMove ? state.lastMove.map(m => [...m]) : null,
    logs: state.logs.map(x => ({ ...x })),
    moveList: [...state.moveList],
    gameOver: state.gameOver,
    winner: state.winner,
    timers: { ...state.timers },
    activeTimer: state.activeTimer
  });
}

function addLog(text, type = 'move') {
  state.logs.unshift({ type, text });
}

function evaluateAfterMove() {
  const checked = isInCheck(state.turn, state.board);
  const hasMove = hasAnyLegalMove(state.board, state.turn);
  if (!hasMove) {
    state.gameOver = true;
    if (checked) {
      state.winner = state.turn === 'r' ? 'b' : 'r';
      statusEl.textContent = `${state.turn === 'r' ? '红方' : '黑方'}被将死，${state.winner === 'r' ? '红方' : '黑方'}获胜`;
    } else {
      statusEl.textContent = '困毙（无合法着法）和棋';
    }
    addLog(statusEl.textContent, 'meta');
    return;
  }
  statusEl.textContent = `${state.turn === 'r' ? '红方' : '黑方'}行棋${checked ? '（被将军）' : ''}`;
}

function applyMove(fr, fc, tr, tc) {
  if (state.gameOver) return;
  const moved = state.board[fr][fc];
  const captured = state.board[tr][tc];
  pushHistory();
  state.board[tr][tc] = moved;
  state.board[fr][fc] = null;
  state.lastMove = [[fr, fc], [tr, tc]];
  state.selected = null;
  state.legalTargets = [];

  const notation = moveToChineseNotation({ moved, from: [fr, fc], to: [tr, tc] });
  state.moveList.push(notation);
  const sideText = moved.side === 'r' ? '红' : '黑';
  const coordHint = `［坐标 ${fr},${fc} → ${tr},${tc}］`;
  addLog(`${state.moveList.length}. ${sideText}${notation}${captured ? `（吃${pieceText[captured.side][captured.kind]}）` : ''} ${coordHint}`);

  if (captured?.kind === 'K') {
    state.gameOver = true;
    state.winner = moved.side;
    statusEl.textContent = `${moved.side === 'r' ? '红方' : '黑方'}获胜（将/帅被吃）`;
    addLog(statusEl.textContent, 'meta');
    render();
    return;
  }

  switchTurn();
  evaluateAfterMove();
  render();
}

function onCellClick(r, c) {
  if (state.gameOver) return;
  const p = state.board[r][c];
  if (state.selected) {
    const [sr, sc] = state.selected;
    if (state.legalTargets.some(([tr, tc]) => tr === r && tc === c)) {
      applyMove(sr, sc, r, c);
      return;
    }
  }
  if (p && p.side === state.turn) {
    state.selected = [r, c];
    state.legalTargets = getLegalMoves(state.board, state.turn, r, c);
  } else {
    state.selected = null;
    state.legalTargets = [];
  }
  render();
}

function marker(cls, r, c) {
  const e = document.createElement('div');
  e.className = cls;
  const { x, y } = boardPixel(r, c);
  e.style.left = `${x}px`; e.style.top = `${y}px`;
  overlayEl.appendChild(e);
}

function renderLogs() {
  logEl.innerHTML = state.logs
    .map(item => `<div class="${item.type === 'meta' ? 'meta' : ''}">${item.text}</div>`)
    .join('');
}

function render() {
  overlayEl.innerHTML = '';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const hs = document.createElement('button');
      hs.className = 'hotspot';
      hs.type = 'button';
      hs.setAttribute('aria-label', `落点 ${r},${c}`);
      const { x, y } = boardPixel(r, c);
      hs.style.left = `${x}px`; hs.style.top = `${y}px`;
      hs.addEventListener('click', () => onCellClick(r, c));
      overlayEl.appendChild(hs);

      const p = state.board[r][c];
      if (!p) continue;
      const piece = document.createElement('div');
      piece.className = `piece ${p.side === 'r' ? 'red' : 'black'}`;
      piece.textContent = pieceText[p.side][p.kind];
      piece.style.left = `${x}px`; piece.style.top = `${y}px`;
      overlayEl.appendChild(piece);
    }
  }

  if (state.selected) marker('selected-ring', state.selected[0], state.selected[1]);
  state.legalTargets.forEach(([r, c]) => marker('target-dot', r, c));
  if (state.lastMove) {
    marker('last-ring', state.lastMove[0][0], state.lastMove[0][1]);
    marker('last-ring', state.lastMove[1][0], state.lastMove[1][1]);
  }

  updateTimersUI();
  renderLogs();
}

function resetGame() {
  state.board = createInitialBoard();
  state.turn = 'r';
  state.selected = null;
  state.legalTargets = [];
  state.history = [];
  state.logs = [{ type: 'meta', text: '开局：红方先行。' }];
  state.moveList = [];
  state.lastMove = null;
  state.gameOver = false;
  state.winner = null;
  state.timers = { r: 0, b: 0 };
  state.activeTimer = 'r';
  statusEl.textContent = '红方先行';
  render();
}

function saveCurrent() {
  saveState({
    board: state.board,
    turn: state.turn,
    selected: state.selected,
    legalTargets: state.legalTargets,
    history: state.history,
    logs: state.logs,
    moveList: state.moveList,
    lastMove: state.lastMove,
    gameOver: state.gameOver,
    winner: state.winner,
    timers: state.timers,
    activeTimer: state.activeTimer
  });
  addLog('已保存到本地存档。', 'meta');
  renderLogs();
}

function loadCurrent(showMessage = true) {
  const saved = loadState();
  if (!saved) {
    if (showMessage) {
      addLog('未找到本地存档。', 'meta');
      renderLogs();
    }
    return false;
  }
  Object.assign(state, saved);
  state.selected = state.selected ?? null;
  state.legalTargets = state.legalTargets ?? [];
  statusEl.textContent = state.gameOver
    ? (state.winner ? `${state.winner === 'r' ? '红方' : '黑方'}已胜` : '已和棋')
    : `${state.turn === 'r' ? '红方' : '黑方'}行棋`;
  if (showMessage) addLog('已从本地存档恢复。', 'meta');
  render();
  return true;
}

undoBtn.addEventListener('click', () => {
  const prev = state.history.pop();
  if (!prev) return;
  Object.assign(state, prev);
  statusEl.textContent = state.gameOver
    ? (state.winner ? `${state.winner === 'r' ? '红方' : '黑方'}已胜` : '已和棋')
    : `${state.turn === 'r' ? '红方' : '黑方'}行棋`;
  addLog('已悔棋一步（含完整记录恢复）。', 'meta');
  render();
});

saveBtn.addEventListener('click', saveCurrent);
loadBtn.addEventListener('click', () => loadCurrent(true));

resignBtn.addEventListener('click', () => {
  if (state.gameOver) return;
  pushHistory();
  state.gameOver = true;
  state.winner = state.turn === 'r' ? 'b' : 'r';
  statusEl.textContent = `${state.turn === 'r' ? '红方' : '黑方'}认输，${state.winner === 'r' ? '红方' : '黑方'}获胜`;
  addLog(statusEl.textContent, 'meta');
  render();
});

drawBtn.addEventListener('click', () => {
  if (state.gameOver) return;
  pushHistory();
  state.gameOver = true;
  state.winner = null;
  statusEl.textContent = '双方同意和棋（简化处理）';
  addLog(statusEl.textContent, 'meta');
  render();
});

resetBtn.addEventListener('click', () => {
  resetGame();
  saveCurrent();
});

window.addEventListener('beforeunload', saveCurrent);
window.addEventListener('resize', render);

drawBoardGrid();
resetGame();
loadCurrent(false);
startTimer();
