const boardElement = document.getElementById("board");
const moveList = document.getElementById("move-list");
const turnIndicator = document.getElementById("turn-indicator");
const aiIndicator = document.getElementById("ai-indicator");
const undoButton = document.getElementById("undo");
const restartButton = document.getElementById("restart");
const difficultySelect = document.getElementById("difficulty");
const fenInput = document.getElementById("fen-input");
const applyFenButton = document.getElementById("apply-fen");
const enterEditButton = document.getElementById("enter-edit");
const exitEditButton = document.getElementById("exit-edit");
const paletteElement = document.getElementById("palette");
const editorElement = document.getElementById("editor");

const BOARD_ROWS = 10;
const BOARD_COLS = 9;
const RED = "red";
const BLACK = "black";
const PIECES = {
  r: { name: "车", type: "rook" },
  h: { name: "马", type: "knight" },
  e: { name: "相", type: "bishop" },
  a: { name: "仕", type: "advisor" },
  k: { name: "帅", type: "king" },
  c: { name: "炮", type: "cannon" },
  p: { name: "兵", type: "pawn" },
};

const PIECE_VALUES = {
  rook: 500,
  knight: 300,
  bishop: 200,
  advisor: 200,
  king: 20000,
  cannon: 350,
  pawn: 100,
};

const INITIAL_FEN = "rheakaehr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RHEAKAEHR r";

let board = createEmptyBoard();
let currentTurn = RED;
let humanSide = RED;
let selected = null;
let legalTargets = [];
let moveHistory = [];
let editMode = false;
let selectedPalette = null;
let aiTimeout = null;

function createEmptyBoard() {
  return Array.from({ length: BOARD_ROWS }, () => Array(BOARD_COLS).fill(null));
}

function cloneBoard(source) {
  return source.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

function inBounds(row, col) {
  return row >= 0 && row < BOARD_ROWS && col >= 0 && col < BOARD_COLS;
}

function isRed(piece) {
  return piece && piece.color === RED;
}

function isBlack(piece) {
  return piece && piece.color === BLACK;
}

function parseFen(fen) {
  const [placement, active] = fen.trim().split(/\s+/);
  const rows = placement.split("/");
  if (rows.length !== BOARD_ROWS) {
    throw new Error("FEN 行数不正确");
  }
  const newBoard = createEmptyBoard();
  rows.forEach((row, rowIndex) => {
    let col = 0;
    for (const char of row) {
      if (Number.isInteger(Number(char))) {
        col += Number(char);
      } else {
        const lower = char.toLowerCase();
        const piece = PIECES[lower];
        if (!piece) {
          throw new Error("未知棋子：" + char);
        }
        newBoard[rowIndex][col] = {
          ...piece,
          color: char === lower ? BLACK : RED,
          fen: char,
        };
        col += 1;
      }
    }
    if (col !== BOARD_COLS) {
      throw new Error("FEN 列数不正确");
    }
  });
  return { board: newBoard, turn: active === "b" ? BLACK : RED };
}

function boardToFen() {
  const rows = board.map((row) => {
    let empty = 0;
    let line = "";
    row.forEach((cell) => {
      if (!cell) {
        empty += 1;
      } else {
        if (empty) {
          line += empty;
          empty = 0;
        }
        line += cell.fen || (cell.color === RED ? cell.type[0].toUpperCase() : cell.type[0]);
      }
    });
    if (empty) {
      line += empty;
    }
    return line;
  });
  const active = currentTurn === BLACK ? "b" : "r";
  return `${rows.join("/")} ${active}`;
}

function initBoard(fen = INITIAL_FEN) {
  const { board: newBoard, turn } = parseFen(fen);
  board = newBoard;
  currentTurn = turn;
  selected = null;
  legalTargets = [];
  moveHistory = [];
  clearAiTimeout();
  renderBoard();
  renderHistory();
  updateStatus();
  maybeTriggerAi();
}

function renderBoard() {
  boardElement.innerHTML = "";
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      const piece = board[row][col];
      if (piece) {
        cell.textContent = piece.name;
        cell.classList.add(piece.color);
      }
      if (selected && selected.row === row && selected.col === col) {
        cell.classList.add("selected");
      }
      if (legalTargets.some((target) => target.row === row && target.col === col)) {
        cell.classList.add("legal");
      }
      cell.addEventListener("click", handleCellClick);
      boardElement.appendChild(cell);
    }
  }
}

function renderHistory() {
  moveList.innerHTML = "";
  moveHistory.forEach((move, index) => {
    const item = document.createElement("li");
    item.textContent = `${index + 1}. ${move.notation}`;
    moveList.appendChild(item);
  });
}

function updateStatus(message) {
  const turnText = currentTurn === RED ? "红方" : "黑方";
  turnIndicator.textContent = message || `${turnText}行动`;
  aiIndicator.textContent = isAiTurn() && !editMode ? "AI 思考中…" : "等待玩家操作";
}

function handleCellClick(event) {
  const row = Number(event.currentTarget.dataset.row);
  const col = Number(event.currentTarget.dataset.col);
  if (editMode) {
    handleEditPlacement(row, col);
    return;
  }
  if (isAiTurn()) {
    return;
  }
  const piece = board[row][col];
  if (selected) {
    const target = legalTargets.find((move) => move.row === row && move.col === col);
    if (target) {
      makeMove(selected.row, selected.col, row, col, true);
      selected = null;
      legalTargets = [];
      renderBoard();
      maybeTriggerAi();
      return;
    }
  }
  if (piece && piece.color === currentTurn) {
    selected = { row, col };
    legalTargets = getLegalMoves(currentTurn).filter(
      (move) => move.from.row === row && move.from.col === col
    );
    renderBoard();
  } else {
    selected = null;
    legalTargets = [];
    renderBoard();
  }
}

function makeMove(fromRow, fromCol, toRow, toCol, record) {
  const movingPiece = board[fromRow][fromCol];
  const captured = board[toRow][toCol];
  board[toRow][toCol] = movingPiece;
  board[fromRow][fromCol] = null;
  const notation = `${movingPiece.name}${fromCol + 1}-${toCol + 1}`;
  if (record) {
    moveHistory.push({
      from: { row: fromRow, col: fromCol },
      to: { row: toRow, col: toCol },
      moving: movingPiece,
      captured,
      turn: currentTurn,
      notation,
    });
  }
  currentTurn = currentTurn === RED ? BLACK : RED;
  renderHistory();
  updateStatus();
}

function undoMove() {
  if (moveHistory.length === 0) {
    return;
  }
  const last = moveHistory.pop();
  board[last.from.row][last.from.col] = last.moving;
  board[last.to.row][last.to.col] = last.captured;
  currentTurn = last.turn;
  selected = null;
  legalTargets = [];
  renderBoard();
  renderHistory();
  updateStatus();
}

function isAiTurn() {
  return currentTurn !== humanSide;
}

function maybeTriggerAi() {
  if (!isAiTurn() || editMode) {
    return;
  }
  clearAiTimeout();
  const delay = 500 + Math.random() * 400;
  aiTimeout = setTimeout(() => {
    performAiMove();
  }, delay);
}

function clearAiTimeout() {
  if (aiTimeout) {
    clearTimeout(aiTimeout);
    aiTimeout = null;
  }
}

function performAiMove() {
  if (!isAiTurn() || editMode) {
    return;
  }
  const moves = getLegalMoves(currentTurn);
  if (moves.length === 0) {
    updateStatus("无合法走法");
    return;
  }
  const difficulty = difficultySelect.value;
  let move = null;
  if (difficulty === "easy") {
    move = Math.random() < 0.35 ? pickRandomMove(moves) : pickBestMove(1);
  } else if (difficulty === "normal") {
    move = pickBestMove(2);
  } else {
    move = pickBestMove(3);
  }
  if (!move) {
    move = pickRandomMove(moves);
  }
  makeMove(move.from.row, move.from.col, move.to.row, move.to.col, true);
  renderBoard();
  updateStatus();
}

function pickRandomMove(moves) {
  return moves[Math.floor(Math.random() * moves.length)];
}

function pickBestMove(depth) {
  const maximizing = currentTurn;
  const { move } = minimax(board, depth, -Infinity, Infinity, maximizing);
  return move;
}

function minimax(stateBoard, depth, alpha, beta, maximizingColor) {
  if (depth === 0) {
    return { score: evaluateBoard(stateBoard, maximizingColor) };
  }
  const currentColor = depth % 2 === 0 ? opposite(maximizingColor) : maximizingColor;
  const moves = getLegalMoves(currentColor, stateBoard);
  if (moves.length === 0) {
    return { score: evaluateBoard(stateBoard, maximizingColor) };
  }
  let bestMove = null;
  if (currentColor === maximizingColor) {
    let maxEval = -Infinity;
    for (const move of moves) {
      const nextBoard = applyMove(stateBoard, move);
      const result = minimax(nextBoard, depth - 1, alpha, beta, maximizingColor);
      if (result.score > maxEval) {
        maxEval = result.score;
        bestMove = move;
      }
      alpha = Math.max(alpha, result.score);
      if (beta <= alpha) {
        break;
      }
    }
    return { score: maxEval, move: bestMove };
  }
  let minEval = Infinity;
  for (const move of moves) {
    const nextBoard = applyMove(stateBoard, move);
    const result = minimax(nextBoard, depth - 1, alpha, beta, maximizingColor);
    if (result.score < minEval) {
      minEval = result.score;
      bestMove = move;
    }
    beta = Math.min(beta, result.score);
    if (beta <= alpha) {
      break;
    }
  }
  return { score: minEval, move: bestMove };
}

function applyMove(stateBoard, move) {
  const next = cloneBoard(stateBoard);
  next[move.to.row][move.to.col] = next[move.from.row][move.from.col];
  next[move.from.row][move.from.col] = null;
  return next;
}

function evaluateBoard(stateBoard, perspective) {
  let score = 0;
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      const piece = stateBoard[row][col];
      if (!piece) {
        continue;
      }
      const value = PIECE_VALUES[piece.type] || 0;
      score += piece.color === perspective ? value : -value;
    }
  }
  return score;
}

function opposite(color) {
  return color === RED ? BLACK : RED;
}

function getLegalMoves(color, stateBoard = board) {
  const moves = [];
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      const piece = stateBoard[row][col];
      if (!piece || piece.color !== color) {
        continue;
      }
      const pseudo = getPseudoMoves(piece, row, col, stateBoard);
      for (const move of pseudo) {
        const next = applyMove(stateBoard, { from: { row, col }, to: move });
        if (!isInCheck(color, next)) {
          moves.push({ from: { row, col }, to: move, piece });
        }
      }
    }
  }
  return moves;
}

function getPseudoMoves(piece, row, col, stateBoard) {
  switch (piece.type) {
    case "rook":
      return linearMoves(row, col, stateBoard, [
        { dr: 1, dc: 0 },
        { dr: -1, dc: 0 },
        { dr: 0, dc: 1 },
        { dr: 0, dc: -1 },
      ], piece.color);
    case "cannon":
      return cannonMoves(row, col, stateBoard, piece.color);
    case "knight":
      return knightMoves(row, col, stateBoard, piece.color);
    case "bishop":
      return bishopMoves(row, col, stateBoard, piece.color);
    case "advisor":
      return advisorMoves(row, col, stateBoard, piece.color);
    case "king":
      return kingMoves(row, col, stateBoard, piece.color);
    case "pawn":
      return pawnMoves(row, col, stateBoard, piece.color);
    default:
      return [];
  }
}

function linearMoves(row, col, stateBoard, directions, color) {
  const moves = [];
  for (const { dr, dc } of directions) {
    let r = row + dr;
    let c = col + dc;
    while (inBounds(r, c)) {
      const target = stateBoard[r][c];
      if (!target) {
        moves.push({ row: r, col: c });
      } else {
        if (target.color !== color) {
          moves.push({ row: r, col: c });
        }
        break;
      }
      r += dr;
      c += dc;
    }
  }
  return moves;
}

function cannonMoves(row, col, stateBoard, color) {
  const moves = [];
  const directions = [
    { dr: 1, dc: 0 },
    { dr: -1, dc: 0 },
    { dr: 0, dc: 1 },
    { dr: 0, dc: -1 },
  ];
  for (const { dr, dc } of directions) {
    let r = row + dr;
    let c = col + dc;
    let jumped = false;
    while (inBounds(r, c)) {
      const target = stateBoard[r][c];
      if (!jumped) {
        if (!target) {
          moves.push({ row: r, col: c });
        } else {
          jumped = true;
        }
      } else if (target) {
        if (target.color !== color) {
          moves.push({ row: r, col: c });
        }
        break;
      }
      r += dr;
      c += dc;
    }
  }
  return moves;
}

function knightMoves(row, col, stateBoard, color) {
  const moves = [];
  const steps = [
    { dr: -2, dc: -1, block: { dr: -1, dc: 0 } },
    { dr: -2, dc: 1, block: { dr: -1, dc: 0 } },
    { dr: 2, dc: -1, block: { dr: 1, dc: 0 } },
    { dr: 2, dc: 1, block: { dr: 1, dc: 0 } },
    { dr: -1, dc: -2, block: { dr: 0, dc: -1 } },
    { dr: 1, dc: -2, block: { dr: 0, dc: -1 } },
    { dr: -1, dc: 2, block: { dr: 0, dc: 1 } },
    { dr: 1, dc: 2, block: { dr: 0, dc: 1 } },
  ];
  for (const step of steps) {
    const blockRow = row + step.block.dr;
    const blockCol = col + step.block.dc;
    const targetRow = row + step.dr;
    const targetCol = col + step.dc;
    if (!inBounds(targetRow, targetCol) || !inBounds(blockRow, blockCol)) {
      continue;
    }
    if (stateBoard[blockRow][blockCol]) {
      continue;
    }
    const target = stateBoard[targetRow][targetCol];
    if (!target || target.color !== color) {
      moves.push({ row: targetRow, col: targetCol });
    }
  }
  return moves;
}

function bishopMoves(row, col, stateBoard, color) {
  const moves = [];
  const steps = [
    { dr: -2, dc: -2, block: { dr: -1, dc: -1 } },
    { dr: -2, dc: 2, block: { dr: -1, dc: 1 } },
    { dr: 2, dc: -2, block: { dr: 1, dc: -1 } },
    { dr: 2, dc: 2, block: { dr: 1, dc: 1 } },
  ];
  for (const step of steps) {
    const blockRow = row + step.block.dr;
    const blockCol = col + step.block.dc;
    const targetRow = row + step.dr;
    const targetCol = col + step.dc;
    if (!inBounds(targetRow, targetCol) || !inBounds(blockRow, blockCol)) {
      continue;
    }
    if (stateBoard[blockRow][blockCol]) {
      continue;
    }
    if (color === RED && targetRow < 5) {
      continue;
    }
    if (color === BLACK && targetRow > 4) {
      continue;
    }
    const target = stateBoard[targetRow][targetCol];
    if (!target || target.color !== color) {
      moves.push({ row: targetRow, col: targetCol });
    }
  }
  return moves;
}

function advisorMoves(row, col, stateBoard, color) {
  const moves = [];
  const steps = [
    { dr: -1, dc: -1 },
    { dr: -1, dc: 1 },
    { dr: 1, dc: -1 },
    { dr: 1, dc: 1 },
  ];
  for (const step of steps) {
    const targetRow = row + step.dr;
    const targetCol = col + step.dc;
    if (!inBounds(targetRow, targetCol)) {
      continue;
    }
    if (!isInPalace(targetRow, targetCol, color)) {
      continue;
    }
    const target = stateBoard[targetRow][targetCol];
    if (!target || target.color !== color) {
      moves.push({ row: targetRow, col: targetCol });
    }
  }
  return moves;
}

function kingMoves(row, col, stateBoard, color) {
  const moves = [];
  const steps = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
  ];
  for (const step of steps) {
    const targetRow = row + step.dr;
    const targetCol = col + step.dc;
    if (!inBounds(targetRow, targetCol)) {
      continue;
    }
    if (!isInPalace(targetRow, targetCol, color)) {
      continue;
    }
    const target = stateBoard[targetRow][targetCol];
    if (!target || target.color !== color) {
      moves.push({ row: targetRow, col: targetCol });
    }
  }
  const opponentKing = findKing(opposite(color), stateBoard);
  if (opponentKing && opponentKing.col === col) {
    let clear = true;
    const step = opponentKing.row > row ? 1 : -1;
    for (let r = row + step; r !== opponentKing.row; r += step) {
      if (stateBoard[r][col]) {
        clear = false;
        break;
      }
    }
    if (clear) {
      moves.push({ row: opponentKing.row, col: opponentKing.col });
    }
  }
  return moves;
}

function pawnMoves(row, col, stateBoard, color) {
  const moves = [];
  const forward = color === RED ? -1 : 1;
  const forwardRow = row + forward;
  if (inBounds(forwardRow, col)) {
    const target = stateBoard[forwardRow][col];
    if (!target || target.color !== color) {
      moves.push({ row: forwardRow, col: col });
    }
  }
  const crossedRiver = color === RED ? row <= 4 : row >= 5;
  if (crossedRiver) {
    for (const dc of [-1, 1]) {
      const targetCol = col + dc;
      if (!inBounds(row, targetCol)) {
        continue;
      }
      const target = stateBoard[row][targetCol];
      if (!target || target.color !== color) {
        moves.push({ row: row, col: targetCol });
      }
    }
  }
  return moves;
}

function isInPalace(row, col, color) {
  if (col < 3 || col > 5) {
    return false;
  }
  if (color === RED) {
    return row >= 7 && row <= 9;
  }
  return row >= 0 && row <= 2;
}

function findKing(color, stateBoard) {
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      const piece = stateBoard[row][col];
      if (piece && piece.type === "king" && piece.color === color) {
        return { row, col };
      }
    }
  }
  return null;
}

function isInCheck(color, stateBoard) {
  const kingPos = findKing(color, stateBoard);
  if (!kingPos) {
    return true;
  }
  const opponent = opposite(color);
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      const piece = stateBoard[row][col];
      if (!piece || piece.color !== opponent) {
        continue;
      }
      const moves = getPseudoMoves(piece, row, col, stateBoard);
      if (moves.some((move) => move.row === kingPos.row && move.col === kingPos.col)) {
        return true;
      }
    }
  }
  return false;
}

function handleEditPlacement(row, col) {
  if (!selectedPalette) {
    return;
  }
  if (selectedPalette === "empty") {
    board[row][col] = null;
  } else {
    board[row][col] = { ...selectedPalette };
  }
  renderBoard();
}

function setupPalette() {
  const palettePieces = [
    { ...PIECES.r, color: RED, fen: "R" },
    { ...PIECES.h, color: RED, fen: "H" },
    { ...PIECES.e, color: RED, fen: "E" },
    { ...PIECES.a, color: RED, fen: "A" },
    { ...PIECES.k, color: RED, fen: "K" },
    { ...PIECES.c, color: RED, fen: "C" },
    { ...PIECES.p, color: RED, fen: "P" },
    { ...PIECES.r, color: BLACK, fen: "r" },
    { ...PIECES.h, color: BLACK, fen: "h" },
    { ...PIECES.e, color: BLACK, fen: "e" },
    { ...PIECES.a, color: BLACK, fen: "a" },
    { ...PIECES.k, color: BLACK, fen: "k" },
    { ...PIECES.c, color: BLACK, fen: "c" },
    { ...PIECES.p, color: BLACK, fen: "p" },
    { name: "清空", type: "empty" },
  ];
  paletteElement.innerHTML = "";
  palettePieces.forEach((piece) => {
    const button = document.createElement("button");
    button.textContent = piece.name;
    if (piece.color === RED) {
      button.classList.add("red");
    }
    if (piece.color === BLACK) {
      button.classList.add("black");
    }
    button.addEventListener("click", () => {
      selectedPalette = piece.type === "empty" ? "empty" : piece;
      Array.from(paletteElement.children).forEach((child) => child.classList.remove("active"));
      button.classList.add("active");
    });
    paletteElement.appendChild(button);
  });
}

function setEditMode(enabled) {
  editMode = enabled;
  editorElement.classList.toggle("hidden", !enabled);
  exitEditButton.classList.toggle("hidden", !enabled);
  enterEditButton.classList.toggle("hidden", enabled);
  selected = null;
  legalTargets = [];
  renderBoard();
  updateStatus(enabled ? "编辑中" : undefined);
}

undoButton.addEventListener("click", () => {
  undoMove();
});

restartButton.addEventListener("click", () => {
  initBoard(INITIAL_FEN);
});

applyFenButton.addEventListener("click", () => {
  try {
    initBoard(fenInput.value || INITIAL_FEN);
  } catch (error) {
    alert("FEN 无法解析：" + error.message);
  }
});

enterEditButton.addEventListener("click", () => {
  setEditMode(true);
});

exitEditButton.addEventListener("click", () => {
  setEditMode(false);
  fenInput.value = boardToFen();
  updateStatus();
  maybeTriggerAi();
});

Array.from(document.querySelectorAll(".toggle button")).forEach((button) => {
  button.addEventListener("click", () => {
    Array.from(document.querySelectorAll(".toggle button")).forEach((btn) =>
      btn.classList.remove("active")
    );
    button.classList.add("active");
    humanSide = button.dataset.player === "red" ? RED : BLACK;
    updateStatus();
    maybeTriggerAi();
  });
});

setupPalette();
fenInput.value = INITIAL_FEN;
initBoard(INITIAL_FEN);
