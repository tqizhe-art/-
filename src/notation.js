import { CN_NUM, pieceText } from './constants.js';

function fileNumBySide(side, c) {
  // 红方从右到左：1..9；黑方从左到右：1..9
  const n = side === 'r' ? (9 - c) : (c + 1);
  return CN_NUM[n - 1];
}

export function moveToChineseNotation({ moved, from, to }) {
  const [fr, fc] = from;
  const [tr, tc] = to;
  const piece = pieceText[moved.side][moved.kind];
  const srcFile = fileNumBySide(moved.side, fc);

  if (fr === tr) {
    return `${piece}${srcFile}平${fileNumBySide(moved.side, tc)}`;
  }

  const forward = moved.side === 'r' ? tr < fr : tr > fr;
  const action = forward ? '进' : '退';

  if (['N', 'B', 'A'].includes(moved.kind)) {
    return `${piece}${srcFile}${action}${fileNumBySide(moved.side, tc)}`;
  }

  const step = Math.abs(fr - tr);
  return `${piece}${srcFile}${action}${CN_NUM[step - 1]}`;
}
