import { BOARD_SIZE } from "./setup.js";

export function inBounds(pos) {
  return (
    Number.isInteger(pos.x) &&
    Number.isInteger(pos.y) &&
    Number.isInteger(pos.z) &&
    pos.x >= 0 &&
    pos.x < BOARD_SIZE &&
    pos.y >= 0 &&
    pos.y < BOARD_SIZE &&
    pos.z >= 0 &&
    pos.z < BOARD_SIZE
  );
}

export function samePos(a, b) {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

export function posKey(pos) {
  return `${pos.x},${pos.y},${pos.z}`;
}

export function getPieceAt(game, pos) {
  return game.pieces.find((piece) => piece.x === pos.x && piece.y === pos.y && piece.z === pos.z) ?? null;
}

export function getPieceById(game, id) {
  return game.pieces.find((piece) => piece.id === id) ?? null;
}

export function cloneGame(game) {
  return {
    ...game,
    players: {
      white: game.players.white ? { ...game.players.white } : null,
      black: game.players.black ? { ...game.players.black } : null
    },
    pieces: game.pieces.map((piece) => ({ ...piece })),
    moveHistory: game.moveHistory.map((move) => ({ ...move, from: { ...move.from }, to: { ...move.to } })),
    lastMove: game.lastMove
      ? {
          ...game.lastMove,
          from: { ...game.lastMove.from },
          to: { ...game.lastMove.to },
          captured: game.lastMove.captured ? { ...game.lastMove.captured } : null
        }
      : null
  };
}

export function opponent(color) {
  return color === "white" ? "black" : "white";
}

export function homeRank(color) {
  return color === "white" ? 0 : 7;
}

export function pawnZDir(color) {
  return color === "white" ? 1 : -1;
}

export function pawnStartRank(color) {
  return color === "white" ? 1 : 6;
}

export function isPromotionSquare(piece, to, game = null) {
  if (piece.type !== "pawn") return false;
  const isNormalChess = game?.variant === "normal";
  if (piece.color === "white") return to.z === 7 || (!isNormalChess && to.y === 7);
  return to.z === 0 || (!isNormalChess && to.y === 7);
}

export function removePieceAt(game, pos) {
  const index = game.pieces.findIndex((piece) => piece.x === pos.x && piece.y === pos.y && piece.z === pos.z);
  if (index === -1) return null;
  const [removed] = game.pieces.splice(index, 1);
  return removed;
}
