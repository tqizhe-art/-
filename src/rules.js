import { COLS, ROWS, palaceCols } from './constants.js';

export function makePiece(side, kind) { return { side, kind }; }
export function cloneBoard(src) { return src.map(r => r.map(c => c ? { ...c } : null)); }
export function inBoard(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }

export function createInitialBoard() {
  const b = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  const first = ['R', 'N', 'B', 'A', 'K', 'A', 'B', 'N', 'R'];
  first.forEach((k, c) => {
    b[0][c] = makePiece('b', k);
    b[9][c] = makePiece('r', k);
  });
  b[2][1] = makePiece('b', 'C'); b[2][7] = makePiece('b', 'C');
  b[7][1] = makePiece('r', 'C'); b[7][7] = makePiece('r', 'C');
  [0, 2, 4, 6, 8].forEach(c => { b[3][c] = makePiece('b', 'P'); b[6][c] = makePiece('r', 'P'); });
  return b;
}

function isInPalace(side, r, c) {
  if (!palaceCols.includes(c)) return false;
  return side === 'r' ? r >= 7 && r <= 9 : r >= 0 && r <= 2;
}

function crossedRiver(side, r) { return side === 'r' ? r <= 4 : r >= 5; }

export function findGeneral(side, board) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (p?.side === side && p.kind === 'K') return [r, c];
    }
  }
  return null;
}

export function generalsFacing(board) {
  const red = findGeneral('r', board);
  const black = findGeneral('b', board);
  if (!red || !black || red[1] !== black[1]) return false;
  const col = red[1];
  const [top, bottom] = red[0] < black[0] ? [red[0], black[0]] : [black[0], red[0]];
  for (let r = top + 1; r < bottom; r++) {
    if (board[r][col]) return false;
  }
  return true;
}

export function getPseudoMoves(board, r, c) {
  const p = board[r][c];
  if (!p) return [];
  const moves = [];
  const add = (nr, nc) => {
    if (!inBoard(nr, nc)) return;
    const target = board[nr][nc];
    if (!target || target.side !== p.side) moves.push([nr, nc]);
  };

  if (p.kind === 'K') {
    [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dr,dc]) => {
      const nr = r + dr; const nc = c + dc;
      if (isInPalace(p.side, nr, nc)) add(nr, nc);
    });
  } else if (p.kind === 'A') {
    [[1,1],[1,-1],[-1,1],[-1,-1]].forEach(([dr,dc]) => {
      const nr = r + dr; const nc = c + dc;
      if (isInPalace(p.side, nr, nc)) add(nr, nc);
    });
  } else if (p.kind === 'B') {
    [[2,2],[2,-2],[-2,2],[-2,-2]].forEach(([dr,dc]) => {
      const nr = r + dr; const nc = c + dc;
      const eyeR = r + dr / 2; const eyeC = c + dc / 2;
      const riverOkay = p.side === 'r' ? nr >= 5 : nr <= 4;
      if (!inBoard(nr, nc) || !riverOkay) return;
      if (!board[eyeR][eyeC]) add(nr, nc);
    });
  } else if (p.kind === 'N') {
    const jumps = [
      [-2,-1,-1,0],[-2,1,-1,0],[2,-1,1,0],[2,1,1,0],
      [-1,-2,0,-1],[1,-2,0,-1],[-1,2,0,1],[1,2,0,1]
    ];
    jumps.forEach(([dr,dc,br,bc]) => {
      if (board[r + br]?.[c + bc]) return;
      add(r + dr, c + dc);
    });
  } else if (p.kind === 'R') {
    [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dr,dc]) => {
      let nr = r + dr; let nc = c + dc;
      while (inBoard(nr, nc)) {
        if (!board[nr][nc]) moves.push([nr, nc]);
        else {
          if (board[nr][nc].side !== p.side) moves.push([nr, nc]);
          break;
        }
        nr += dr; nc += dc;
      }
    });
  } else if (p.kind === 'C') {
    [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dr,dc]) => {
      let nr = r + dr; let nc = c + dc; let screen = false;
      while (inBoard(nr, nc)) {
        const target = board[nr][nc];
        if (!screen) {
          if (!target) moves.push([nr, nc]);
          else screen = true;
        } else if (target) {
          if (target.side !== p.side) moves.push([nr, nc]);
          break;
        }
        nr += dr; nc += dc;
      }
    });
  } else if (p.kind === 'P') {
    const dir = p.side === 'r' ? -1 : 1;
    add(r + dir, c);
    if (crossedRiver(p.side, r)) {
      add(r, c - 1);
      add(r, c + 1);
    }
  }
  return moves;
}

export function isInCheck(side, board) {
  // 修复：将帅照面也算“被将军”
  if (generalsFacing(board)) return true;
  const g = findGeneral(side, board);
  if (!g) return true;
  const [gr, gc] = g;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (!p || p.side === side) continue;
      const ms = getPseudoMoves(board, r, c);
      if (ms.some(([mr, mc]) => mr === gr && mc === gc)) return true;
    }
  }
  return false;
}

export function getLegalMoves(board, turn, r, c) {
  const piece = board[r][c];
  if (!piece || piece.side !== turn) return [];
  const pseudo = getPseudoMoves(board, r, c);
  return pseudo.filter(([nr, nc]) => {
    const next = cloneBoard(board);
    next[nr][nc] = next[r][c];
    next[r][c] = null;
    return !generalsFacing(next) && !isInCheck(piece.side, next);
  });
}

export function hasAnyLegalMove(board, side) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c]?.side === side && getLegalMoves(board, side, r, c).length > 0) return true;
    }
  }
  return false;
}
