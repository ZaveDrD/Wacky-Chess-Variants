import { inBounds, getPieceAt, samePos, pawnZDir, pawnStartRank } from "./utils.js";

const AXIS_DIRS_3D = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 }
];

const AXIS_DIRS_2D = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 }
];

const PLANE_DIAGONAL_DIRS_3D = [
  { x: 1, y: 1, z: 0 },
  { x: 1, y: -1, z: 0 },
  { x: -1, y: 1, z: 0 },
  { x: -1, y: -1, z: 0 },
  { x: 1, y: 0, z: 1 },
  { x: 1, y: 0, z: -1 },
  { x: -1, y: 0, z: 1 },
  { x: -1, y: 0, z: -1 },
  { x: 0, y: 1, z: 1 },
  { x: 0, y: 1, z: -1 },
  { x: 0, y: -1, z: 1 },
  { x: 0, y: -1, z: -1 }
];

const PLANE_DIAGONAL_DIRS_2D = [
  { x: 1, y: 0, z: 1 },
  { x: 1, y: 0, z: -1 },
  { x: -1, y: 0, z: 1 },
  { x: -1, y: 0, z: -1 }
];

const KNIGHT_DELTAS_3D = buildKnightDeltas3D();
const KNIGHT_DELTAS_2D = [
  { x: 2, y: 0, z: 1 },
  { x: 2, y: 0, z: -1 },
  { x: -2, y: 0, z: 1 },
  { x: -2, y: 0, z: -1 },
  { x: 1, y: 0, z: 2 },
  { x: 1, y: 0, z: -2 },
  { x: -1, y: 0, z: 2 },
  { x: -1, y: 0, z: -2 }
];

function isNormalChess(game) {
  return game?.variant !== "threeD";
}

function buildKnightDeltas3D() {
  const deltas = [];
  const add = (delta) => {
    if (!deltas.some((existing) => samePos(existing, delta))) deltas.push(delta);
  };

  const signs = [-1, 1];
  for (const a of signs) {
    for (const b of signs) {
      add({ x: 2 * a, y: 0, z: 1 * b });
      add({ x: 1 * a, y: 0, z: 2 * b });
      add({ x: 2 * a, y: 1 * b, z: 0 });
      add({ x: 1 * a, y: 2 * b, z: 0 });
      add({ x: 0, y: 2 * a, z: 1 * b });
      add({ x: 0, y: 1 * a, z: 2 * b });
    }
  }

  return deltas;
}

function addDelta(pos, delta, distance = 1) {
  return {
    x: pos.x + delta.x * distance,
    y: pos.y + delta.y * distance,
    z: pos.z + delta.z * distance
  };
}

function makeMoveDescriptor(to, opts = {}) {
  return {
    x: to.x,
    y: to.y,
    z: to.z,
    capture: Boolean(opts.capture),
    castle: Boolean(opts.castle),
    enPassant: Boolean(opts.enPassant),
    promotion: Boolean(opts.promotion)
  };
}

function addStepMove(game, piece, moves, to, opts = {}) {
  if (!inBounds(to)) return;
  if (isNormalChess(game) && to.y !== 0) return;
  const target = getPieceAt(game, to);
  if (target?.type === "wall") return;
  if (target?.color === piece.color) return;
  if (target?.type === "king") return;
  moves.push(makeMoveDescriptor(to, { ...opts, capture: Boolean(target) || opts.capture }));
}

function slidingMoves(game, piece, directions) {
  const moves = [];
  for (const dir of directions) {
    for (let distance = 1; distance < 8; distance += 1) {
      const to = addDelta(piece, dir, distance);
      if (!inBounds(to)) break;
      if (isNormalChess(game) && to.y !== 0) break;
      const target = getPieceAt(game, to);
      if (target) {
        if (target.type !== "wall" && target.color !== piece.color && target.type !== "king") {
          moves.push(makeMoveDescriptor(to, { capture: true }));
        }
        break;
      }
      moves.push(makeMoveDescriptor(to));
    }
  }
  return moves;
}

export function getAttackSquares(game, piece) {
  const axisDirs = isNormalChess(game) ? AXIS_DIRS_2D : AXIS_DIRS_3D;
  const diagonalDirs = isNormalChess(game) ? PLANE_DIAGONAL_DIRS_2D : PLANE_DIAGONAL_DIRS_3D;
  const knightDeltas = isNormalChess(game) ? KNIGHT_DELTAS_2D : KNIGHT_DELTAS_3D;

  switch (piece.type) {
    case "rook":
      return attackSliding(game, piece, axisDirs);
    case "bishop":
      return attackSliding(game, piece, diagonalDirs);
    case "queen":
      return attackSliding(game, piece, [...axisDirs, ...diagonalDirs]);
    case "king":
      return [...axisDirs, ...diagonalDirs]
        .map((dir) => addDelta(piece, dir))
        .filter((pos) => inBounds(pos) && (!isNormalChess(game) || pos.y === 0));
    case "knight":
      return knightDeltas.map((delta) => addDelta(piece, delta)).filter((pos) => inBounds(pos) && (!isNormalChess(game) || pos.y === 0));
    case "pawn":
      return pawnAttackSquares(game, piece).filter((pos) => inBounds(pos) && (!isNormalChess(game) || pos.y === 0));
    default:
      return [];
  }
}

function attackSliding(game, piece, directions) {
  const squares = [];
  for (const dir of directions) {
    for (let distance = 1; distance < 8; distance += 1) {
      const to = addDelta(piece, dir, distance);
      if (!inBounds(to)) break;
      if (isNormalChess(game) && to.y !== 0) break;
      squares.push(to);
      if (getPieceAt(game, to)) break;
    }
  }
  return squares;
}

function pawnAttackSquares(game, piece) {
  const zDir = pawnZDir(piece.color);
  const normalAttacks = [
    { x: piece.x + 1, y: piece.y, z: piece.z + zDir },
    { x: piece.x - 1, y: piece.y, z: piece.z + zDir }
  ];

  if (isNormalChess(game)) return normalAttacks;

  return [
    ...normalAttacks,
    { x: piece.x + 1, y: piece.y + 1, z: piece.z },
    { x: piece.x - 1, y: piece.y + 1, z: piece.z },
    { x: piece.x, y: piece.y + 1, z: piece.z + zDir }
  ];
}

function pawnMoves(game, piece) {
  const moves = [];
  const zDir = pawnZDir(piece.color);
  const normalChess = isNormalChess(game);

  const oneForward = { x: piece.x, y: piece.y, z: piece.z + zDir };
  if (inBounds(oneForward) && (!normalChess || oneForward.y === 0) && !getPieceAt(game, oneForward)) {
    moves.push(makeMoveDescriptor(oneForward));

    const twoForward = { x: piece.x, y: piece.y, z: piece.z + 2 * zDir };
    if (
      piece.z === pawnStartRank(piece.color) &&
      piece.y === 0 &&
      !piece.hasMoved &&
      inBounds(twoForward) &&
      !getPieceAt(game, twoForward)
    ) {
      moves.push(makeMoveDescriptor(twoForward));
    }
  }

  if (!normalChess) {
    const oneUp = { x: piece.x, y: piece.y + 1, z: piece.z };
    if (inBounds(oneUp) && !getPieceAt(game, oneUp)) {
      moves.push(makeMoveDescriptor(oneUp));

      const twoUp = { x: piece.x, y: piece.y + 2, z: piece.z };
      if (
        piece.z === pawnStartRank(piece.color) &&
        piece.y === 0 &&
        !piece.hasMoved &&
        inBounds(twoUp) &&
        !getPieceAt(game, twoUp)
      ) {
        moves.push(makeMoveDescriptor(twoUp));
      }
    }
  }

  for (const attack of pawnAttackSquares(game, piece)) {
    if (!inBounds(attack)) continue;
    if (normalChess && attack.y !== 0) continue;
    const target = getPieceAt(game, attack);
    if (target && target.type !== "wall" && target.color !== piece.color && target.type !== "king") {
      moves.push(makeMoveDescriptor(attack, { capture: true }));
    }
  }

  addEnPassantMoves(game, piece, moves);

  return moves;
}

function addEnPassantMoves(game, piece, moves) {
  const last = game.lastMove;
  if (!last || !last.wasDoubleStep || last.pieceType !== "pawn" || last.pieceColor === piece.color) return;

  const zDir = pawnZDir(piece.color);
  const enemyPawn = getPieceAt(game, last.to);
  if (!enemyPawn || enemyPawn.id !== last.pieceId) return;

  const sameLayer = enemyPawn.y === piece.y;
  const adjacentX = Math.abs(enemyPawn.x - piece.x) === 1;
  const sameRank = enemyPawn.z === piece.z;
  if (!sameLayer || !adjacentX || !sameRank) return;

  const target = { x: enemyPawn.x, y: piece.y, z: piece.z + zDir };
  if (inBounds(target) && !getPieceAt(game, target)) {
    moves.push(makeMoveDescriptor(target, { capture: true, enPassant: true }));
  }
}

export function getPseudoLegalMoves(game, piece) {
  if (["wall"].includes(piece?.type)) return [];
  const axisDirs = isNormalChess(game) ? AXIS_DIRS_2D : AXIS_DIRS_3D;
  const diagonalDirs = isNormalChess(game) ? PLANE_DIAGONAL_DIRS_2D : PLANE_DIAGONAL_DIRS_3D;
  const knightDeltas = isNormalChess(game) ? KNIGHT_DELTAS_2D : KNIGHT_DELTAS_3D;

  switch (piece.type) {
    case "rook":
      return slidingMoves(game, piece, axisDirs);
    case "bishop":
      return slidingMoves(game, piece, diagonalDirs);
    case "queen":
      return slidingMoves(game, piece, [...axisDirs, ...diagonalDirs]);
    case "king": {
      const moves = [];
      for (const dir of [...axisDirs, ...diagonalDirs]) {
        addStepMove(game, piece, moves, addDelta(piece, dir));
      }
      return moves;
    }
    case "knight": {
      const moves = [];
      for (const delta of knightDeltas) {
        addStepMove(game, piece, moves, addDelta(piece, delta));
      }
      return moves;
    }
    case "pawn":
      return pawnMoves(game, piece);
    default:
      return [];
  }
}
