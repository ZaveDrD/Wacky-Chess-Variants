import { getAttackSquares, getPseudoLegalMoves } from "./movement.js";
import {
  cloneGame,
  getPieceAt,
  getPieceById,
  homeRank,
  inBounds,
  isPromotionSquare,
  opponent,
  pawnZDir,
  removePieceAt,
  samePos,
  recordCurrentPosition
} from "./utils.js";

export function isSquareAttacked(game, square, byColor) {
  return game.pieces
    .filter((piece) => piece.color === byColor)
    .some((piece) => getAttackSquares(game, piece).some((attack) => samePos(attack, square)));
}

export function getKing(game, color) {
  return game.pieces.find((piece) => piece.type === "king" && piece.color === color) ?? null;
}

function isHillCenter(pos) {
  return pos && [3, 4].includes(pos.x) && [3, 4].includes(pos.z) && pos.y === 0;
}

function getMissingKingEndState(game) {
  const whiteKing = getKing(game, "white");
  const blackKing = getKing(game, "black");
  if (whiteKing && blackKing) return null;
  if (!whiteKing && !blackKing) {
    return { check: null, checkmate: false, stalemate: true, winner: null, status: "finished", message: "Draw: both kings were destroyed." };
  }
  const winner = whiteKing ? "white" : "black";
  return { check: null, checkmate: true, stalemate: false, winner, status: "finished", message: `${winner} wins because the enemy king was destroyed.` };
}

function getHillEndState(game) {
  if (game.variant !== "kingOfTheHill") return null;
  const whiteKing = getKing(game, "white");
  const blackKing = getKing(game, "black");
  if (isHillCenter(whiteKing)) return { check: null, checkmate: false, stalemate: false, winner: "white", status: "finished", message: "white wins by reaching the hill." };
  if (isHillCenter(blackKing)) return { check: null, checkmate: false, stalemate: false, winner: "black", status: "finished", message: "black wins by reaching the hill." };
  return null;
}

export function isKingInCheck(game, color) {
  const king = getKing(game, color);
  if (!king) return true;
  return isSquareAttacked(game, king, opponent(color));
}

export function getLegalMoves(game, piece) {
  if (!piece) return [];

  const pseudoMoves = getPseudoLegalMoves(game, piece);
  const withCastling = piece.type === "king" ? [...pseudoMoves, ...getCastleMoves(game, piece)] : pseudoMoves;

  return withCastling.filter((move) => {
    const testGame = cloneGame(game);
    applyMoveUnchecked(testGame, piece.id, move, { promotion: "queen" });
    return !isKingInCheck(testGame, piece.color);
  });
}

export function hasAnyLegalMove(game, color) {
  return game.pieces
    .filter((piece) => piece.color === color)
    .some((piece) => getLegalMoves(game, piece).length > 0);
}

export function getGameEndState(game, colorToMove) {
  const missingKing = getMissingKingEndState(game);
  if (missingKing) return missingKing;
  const hillState = getHillEndState(game);
  if (hillState) return hillState;
  const inCheck = isKingInCheck(game, colorToMove);
  const hasMove = hasAnyLegalMove(game, colorToMove);

  if (inCheck && !hasMove) {
    return {
      check: colorToMove,
      checkmate: true,
      stalemate: false,
      winner: opponent(colorToMove),
      status: "finished",
      message: `${opponent(colorToMove)} wins by checkmate.`
    };
  }

  if (!inCheck && !hasMove) {
    return {
      check: null,
      checkmate: false,
      stalemate: true,
      winner: null,
      status: "finished",
      message: "Draw by stalemate."
    };
  }

  return {
    check: inCheck ? colorToMove : null,
    checkmate: false,
    stalemate: false,
    winner: null,
    status: "playing",
    message: inCheck ? `${colorToMove} is in check.` : `${colorToMove} to move.`
  };
}


export function applyAutomaticDrawRules(game) {
  if (!game || game.status !== "playing") return game;

  const repeatCount = recordCurrentPosition(game);
  if (repeatCount >= 3) {
    const adjudicatedWinner = getBotOnlyAdjudicationWinner(game);
    game.check = null;
    game.checkmate = false;
    game.stalemate = false;
    game.repetition = true;
    game.winner = adjudicatedWinner;
    game.status = "finished";
    game.message = adjudicatedWinner
      ? `${adjudicatedWinner} wins by anti-loop adjudication.`
      : "Draw by threefold repetition.";
    game.lastTurnStartedAt = null;
    return game;
  }

  if ((Number(game.halfmoveClock) || 0) >= 100) {
    const adjudicatedWinner = getBotOnlyAdjudicationWinner(game);
    game.check = null;
    game.checkmate = false;
    game.stalemate = false;
    game.fiftyMoveRule = true;
    game.winner = adjudicatedWinner;
    game.status = "finished";
    game.message = adjudicatedWinner
      ? `${adjudicatedWinner} wins by no-progress adjudication.`
      : "Draw by fifty-move rule.";
    game.lastTurnStartedAt = null;
  }

  return game;
}

function getBotOnlyAdjudicationWinner(game) {
  const aiColors = Array.isArray(game?.ai?.colors) ? game.ai.colors : [];
  const botOnly = game?.ai?.enabled && aiColors.includes("white") && aiColors.includes("black");
  if (!botOnly) return null;

  const whiteScore = adjudicationScore(game, "white");
  const blackScore = adjudicationScore(game, "black");
  if (Math.abs(whiteScore - blackScore) < 0.001) return null;
  return whiteScore > blackScore ? "white" : "black";
}

function adjudicationScore(game, color) {
  const values = { pawn: 100, knight: 320, bishop: 330, rook: 500, queen: 900, king: 0 };
  const pieces = game.pieces || [];
  let score = 0;

  for (const piece of pieces) {
    if (piece.color !== color) continue;
    score += values[piece.type] || 0;
    if (piece.type === "pawn") {
      const zProgress = color === "white" ? piece.z : 7 - piece.z;
      const yProgress = game.variant === "threeD" ? piece.y : 0;
      score += zProgress * 18 + yProgress * 12;
    }
    if (piece.type === "king") {
      score += 3.5 - Math.abs(3.5 - piece.x);
      score += 3.5 - Math.abs(3.5 - piece.z);
      if (game.variant === "threeD") score += (3.5 - Math.abs(3.5 - piece.y)) * 0.5;
    }
  }

  const enemyKing = pieces.find((piece) => piece.color === opponent(color) && piece.type === "king");
  if (enemyKing) {
    for (const piece of pieces.filter((item) => item.color === color && item.type !== "king")) {
      const distance = Math.abs(piece.x - enemyKing.x) + Math.abs(piece.y - enemyKing.y) + Math.abs(piece.z - enemyKing.z);
      score += Math.max(0, 12 - distance) * 2;
    }
  }

  return score;
}

function getCastleMoves(game, king) {
  const moves = [];
  const z = homeRank(king.color);
  const y = 0;

  if (king.hasMoved || king.y !== y || king.z !== z) return moves;
  if (isKingInCheck(game, king.color)) return moves;

  for (const side of ["kingSide", "queenSide"]) {
    const isKingSide = side === "kingSide";
    const kingTargetX = isKingSide ? 6 : 2;
    const rookTargetX = isKingSide ? 5 : 3;
    const rook = findCastleRook(game, king, side);
    if (!rook || rook.hasMoved) continue;

    const betweenKingAndRook = rangeBetween(king.x, rook.x).filter((x) => x !== king.x && x !== rook.x);
    const pathClear = betweenKingAndRook.every((x) => !getPieceAt(game, { x, y, z }));
    if (!pathClear) continue;

    const rookTargetOccupant = getPieceAt(game, { x: rookTargetX, y, z });
    if (rookTargetOccupant && rookTargetOccupant.id !== king.id && rookTargetOccupant.id !== rook.id) continue;

    const kingTargetOccupant = getPieceAt(game, { x: kingTargetX, y, z });
    if (kingTargetOccupant && kingTargetOccupant.id !== king.id && kingTargetOccupant.id !== rook.id) continue;

    const kingPathXs = rangeInclusive(king.x, kingTargetX);
    const pathSafe = kingPathXs.every((x) => !isSquareAttacked(game, { x, y, z }, opponent(king.color)));
    if (!pathSafe) continue;

    moves.push({
      x: kingTargetX,
      y,
      z,
      capture: false,
      castle: true,
      castleSide: side,
      rookId: rook.id,
      rookTo: { x: rookTargetX, y, z },
      promotion: false,
      enPassant: false
    });
  }

  return moves;
}

function findCastleRook(game, king, side) {
  const z = homeRank(king.color);
  const rooks = game.pieces
    .filter((piece) => piece.color === king.color && piece.type === "rook" && piece.y === 0 && piece.z === z && !piece.hasMoved)
    .sort((a, b) => a.x - b.x);

  if (side === "kingSide") {
    return rooks.find((rook) => rook.x > king.x) || null;
  }
  return [...rooks].reverse().find((rook) => rook.x < king.x) || null;
}

function rangeBetween(a, b) {
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  const xs = [];
  for (let x = min; x <= max; x += 1) xs.push(x);
  return xs;
}

function rangeInclusive(a, b) {
  const step = a <= b ? 1 : -1;
  const xs = [];
  for (let x = a; step > 0 ? x <= b : x >= b; x += step) xs.push(x);
  return xs;
}

export function applyMoveUnchecked(game, pieceId, move, options = {}) {
  const piece = getPieceById(game, pieceId);
  if (!piece) return { ok: false, reason: "Piece not found." };

  const originalType = piece.type;
  const from = { x: piece.x, y: piece.y, z: piece.z };
  const to = { x: move.x, y: move.y, z: move.z };
  if (!inBounds(to)) return { ok: false, reason: "Target out of bounds." };

  let captured = null;

  if (move.enPassant) {
    const zDir = pawnZDir(piece.color);
    const captureSquare = { x: to.x, y: to.y, z: to.z - zDir };
    captured = removePieceAt(game, captureSquare);
  } else {
    captured = removePieceAt(game, to);
  }

  if (captured && game.variant === "crazyhouse") {
    if (!game.reserves) game.reserves = { white: [], black: [] };
    if (!Array.isArray(game.reserves[piece.color])) game.reserves[piece.color] = [];
    game.reserves[piece.color].push(captured.type === "king" ? "queen" : captured.type);
  }

  piece.x = to.x;
  piece.y = to.y;
  piece.z = to.z;
  piece.hasMoved = true;

  if (move.castle) {
    const rook = getPieceById(game, move.rookId);
    if (rook) {
      rook.x = move.rookTo.x;
      rook.y = move.rookTo.y;
      rook.z = move.rookTo.z;
      rook.hasMoved = true;
    }
  }

  let promotedTo = null;
  if (isPromotionSquare(piece, to, game)) {
    promotedTo = ["queen", "rook", "bishop", "knight"].includes(options.promotion) ? options.promotion : "queen";
    piece.type = promotedTo;
  }

  let atomicRemoved = [];
  if (game.variant === "atomic" && captured) {
    atomicRemoved = resolveAtomicExplosion(game, to, piece.id, captured);
  }

  const wasDoubleStep = originalType === "pawn" && Math.abs(to.z - from.z) === 2 && to.y === from.y;
  game.halfmoveClock = originalType === "pawn" || captured ? 0 : (Number(game.halfmoveClock) || 0) + 1;

  const moveRecord = {
    pieceId,
    pieceColor: piece.color,
    pieceType: promotedTo ? "pawn" : originalType,
    from,
    to,
    captured: captured ? { id: captured.id, type: captured.type, color: captured.color } : null,
    wasDoubleStep,
    castle: Boolean(move.castle),
    rookId: move.rookId || null,
    rookTo: move.rookTo ? { ...move.rookTo } : null,
    enPassant: Boolean(move.enPassant),
    promotedTo,
    atomicRemoved,
    time: Date.now()
  };

  game.lastMove = moveRecord;
  game.moveHistory.push(moveRecord);

  return { ok: true, moveRecord };
}

function resolveAtomicExplosion(game, centre, movingPieceId, captured) {
  const removed = [];
  const removeIds = new Set();

  for (const piece of game.pieces) {
    const directlyInvolved = piece.id === movingPieceId || piece.id === captured.id;
    const adjacent = Math.max(Math.abs(piece.x - centre.x), Math.abs(piece.y - centre.y), Math.abs(piece.z - centre.z)) <= 1;
    if (directlyInvolved || (adjacent && piece.type !== "pawn")) removeIds.add(piece.id);
  }

  game.pieces = game.pieces.filter((piece) => {
    if (!removeIds.has(piece.id)) return true;
    removed.push({ id: piece.id, type: piece.type, color: piece.color, x: piece.x, y: piece.y, z: piece.z });
    return false;
  });

  return removed;
}

export function attemptLegalDrop(game, playerId, pieceType, to, options = {}) {
  if (game.status !== "playing") return { ok: false, reason: "Game is not currently playing." };
  if (game.variant !== "crazyhouse") return { ok: false, reason: "Drops are only available in Crazyhouse." };

  const devOverride = Boolean(options.devOverride);
  const color = game.turn;
  const player = game.players[color];
  if ((!player || player.id !== playerId) && !devOverride) return { ok: false, reason: "You do not control this turn." };

  const type = normaliseDropPiece(pieceType);
  if (!type) return { ok: false, reason: "Invalid drop piece." };
  if (!inBounds(to) || to.y !== 0) return { ok: false, reason: "Drops must be on the 2D board." };
  if (getPieceAt(game, to)) return { ok: false, reason: "Drop square is occupied." };
  if (type === "pawn" && (to.z === 0 || to.z === 7)) return { ok: false, reason: "Pawns cannot be dropped on the first or last rank." };

  if (!game.reserves || !Array.isArray(game.reserves[color])) game.reserves = { white: [], black: [] };
  const reserveIndex = game.reserves[color].indexOf(type);
  if (reserveIndex < 0 && !devOverride) return { ok: false, reason: `No ${type} available to drop.` };

  const testGame = cloneGame(game);
  applyDropUnchecked(testGame, color, type, to, { consumeReserve: !devOverride || reserveIndex >= 0 });
  if (isKingInCheck(testGame, color)) return { ok: false, reason: "That drop leaves your king in check." };

  const result = applyDropUnchecked(game, color, type, to, { consumeReserve: !devOverride || reserveIndex >= 0 });
  if (!result.ok) return result;

  game.turn = opponent(color);
  Object.assign(game, getGameEndState(game, game.turn));
  applyAutomaticDrawRules(game);
  game.lastTurnStartedAt = game.status === "playing" ? Date.now() : null;
  return { ok: true, game };
}

function applyDropUnchecked(game, color, type, to, options = {}) {
  if (!game.reserves) game.reserves = { white: [], black: [] };
  if (!Array.isArray(game.reserves[color])) game.reserves[color] = [];
  if (options.consumeReserve !== false) {
    const reserveIndex = game.reserves[color].indexOf(type);
    if (reserveIndex < 0) return { ok: false, reason: `No ${type} available to drop.` };
    game.reserves[color].splice(reserveIndex, 1);
  }

  const piece = {
    id: `${color}_drop_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    color,
    x: to.x,
    y: to.y,
    z: to.z,
    hasMoved: true,
    dropped: true
  };
  game.pieces.push(piece);

  const moveRecord = {
    drop: true,
    pieceId: piece.id,
    pieceColor: color,
    pieceType: type,
    from: null,
    to: { ...to },
    captured: null,
    promotedTo: null,
    time: Date.now()
  };
  game.lastMove = moveRecord;
  game.moveHistory.push(moveRecord);
  game.halfmoveClock = type === "pawn" ? 0 : (Number(game.halfmoveClock) || 0) + 1;
  return { ok: true, moveRecord };
}

function normaliseDropPiece(value) {
  const text = String(value || "").trim().toLowerCase();
  const aliases = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen" };
  const type = aliases[text] || text;
  return ["pawn", "knight", "bishop", "rook", "queen"].includes(type) ? type : null;
}

export function attemptLegalMove(game, playerId, pieceId, to, options = {}) {
  if (game.status !== "playing") return { ok: false, reason: "Game is not currently playing." };

  const piece = getPieceById(game, pieceId);
  if (!piece) return { ok: false, reason: "Piece not found." };

  const devOverride = Boolean(options.devOverride);
  const movingColor = piece.color;
  if (piece.color !== game.turn && !devOverride) return { ok: false, reason: "It is not that piece's turn." };

  const player = game.players[piece.color];
  if ((!player || player.id !== playerId) && !devOverride) return { ok: false, reason: "You do not control that piece." };

  const legalMoves = getLegalMoves(game, piece);
  const chosen = legalMoves.find((move) => move.x === to.x && move.y === to.y && move.z === to.z);
  if (!chosen) return { ok: false, reason: "Illegal move." };

  const result = applyMoveUnchecked(game, pieceId, chosen, options);
  if (!result.ok) return result;

  game.turn = opponent(movingColor);
  Object.assign(game, getGameEndState(game, game.turn));
  applyAutomaticDrawRules(game);
  if (game.status === "playing") {
    game.lastTurnStartedAt = Date.now();
  } else {
    game.lastTurnStartedAt = null;
  }

  return { ok: true, game };
}
