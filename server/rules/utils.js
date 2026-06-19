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
    initialPieces: Array.isArray(game.initialPieces) ? game.initialPieces.map((piece) => ({ ...piece })) : undefined,
    reserves: game.reserves ? { white: [...(game.reserves.white || [])], black: [...(game.reserves.black || [])] } : null,
    nuke: game.nuke ? {
      white: { ...game.nuke.white, active: game.nuke.white?.active ? { ...game.nuke.white.active, centre: { ...game.nuke.white.active.centre } } : null },
      black: { ...game.nuke.black, active: game.nuke.black?.active ? { ...game.nuke.black.active, centre: { ...game.nuke.black.active.centre } } : null }
    } : null,
    tycoon: game.tycoon ? {
      money: { ...game.tycoon.money },
      maxMoney: { ...game.tycoon.maxMoney },
      production: { ...game.tycoon.production },
      storageLevel: { ...game.tycoon.storageLevel },
      productionLevel: { ...game.tycoon.productionLevel },
      walls: { ...game.tycoon.walls },
      bombs: (game.tycoon.bombs || []).map((bomb) => ({ ...bomb, centre: { ...bomb.centre } })),
      lastIncome: { ...game.tycoon.lastIncome }
    } : null,
    effects: game.effects ? {
      explosions: (game.effects.explosions || []).map((effect) => ({ ...effect, centre: effect.centre ? { ...effect.centre } : undefined })),
      income: (game.effects.income || []).map((effect) => ({ ...effect }))
    } : { explosions: [], income: [] },
    moveHistory: (game.moveHistory || []).map((move) => ({ ...move, from: move.from ? { ...move.from } : null, to: move.to ? { ...move.to } : null, captured: move.captured ? { ...move.captured } : null, atomicRemoved: Array.isArray(move.atomicRemoved) ? move.atomicRemoved.map((piece) => ({ ...piece })) : undefined })),
    positionHistory: Array.isArray(game.positionHistory) ? [...game.positionHistory] : [],
    positionCounts: game.positionCounts ? { ...game.positionCounts } : {},
    lastMove: game.lastMove
      ? {
          ...game.lastMove,
          from: game.lastMove.from ? { ...game.lastMove.from } : null,
          to: game.lastMove.to ? { ...game.lastMove.to } : null,
          captured: game.lastMove.captured ? { ...game.lastMove.captured } : null,
          atomicRemoved: Array.isArray(game.lastMove.atomicRemoved) ? game.lastMove.atomicRemoved.map((piece) => ({ ...piece })) : undefined
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
  const is2D = game?.variant !== "threeD";
  if (piece.color === "white") return to.z === 7 || (!is2D && to.y === 7);
  return to.z === 0 || (!is2D && to.y === 7);
}

export function removePieceAt(game, pos) {
  const index = game.pieces.findIndex((piece) => piece.x === pos.x && piece.y === pos.y && piece.z === pos.z);
  if (index === -1) return null;
  const [removed] = game.pieces.splice(index, 1);
  return removed;
}


export function positionSignature(game) {
  const pieces = (game.pieces || [])
    .map((piece) => `${piece.color[0]}${piece.type[0]}${piece.hasMoved ? 1 : 0}@${piece.x},${piece.y},${piece.z}`)
    .sort()
    .join("|");

  const lastDoubleStep = game.lastMove?.wasDoubleStep
    ? `${game.lastMove.pieceColor}:${game.lastMove.to.x},${game.lastMove.to.y},${game.lastMove.to.z}`
    : "-";

  return `${game.variant || "threeD"};turn=${game.turn};ep=${lastDoubleStep};${pieces}`;
}

export function recordCurrentPosition(game) {
  if (!game) return 0;
  if (!Array.isArray(game.positionHistory)) game.positionHistory = [];
  if (!game.positionCounts || typeof game.positionCounts !== "object") game.positionCounts = {};

  const signature = positionSignature(game);
  game.positionHistory.push(signature);
  game.positionCounts[signature] = (game.positionCounts[signature] || 0) + 1;
  return game.positionCounts[signature];
}

export function getPositionRepeatCount(game, signature = positionSignature(game)) {
  return Number(game?.positionCounts?.[signature] || 0);
}
