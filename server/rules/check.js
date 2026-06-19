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
  if (!piece || piece.type === "wall") return [];
  if (piece.purchasedTurnToken != null && piece.purchasedTurnToken === game.turnToken) return [];

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
  if (!piece || piece.type === "wall") return { ok: false, reason: "Piece not found." };

  const originalType = piece.type;
  const from = { x: piece.x, y: piece.y, z: piece.z };
  const to = { x: move.x, y: move.y, z: move.z };
  if (!inBounds(to)) return { ok: false, reason: "Target out of bounds." };

  let captured = null;
  let shieldBlocked = false;
  const targetBefore = move.enPassant
    ? getPieceAt(game, { x: to.x, y: to.y, z: to.z - pawnZDir(piece.color) })
    : getPieceAt(game, to);

  if (targetBefore?.shielded) {
    targetBefore.shielded = false;
    shieldBlocked = true;
  } else if (move.enPassant) {
    const zDir = pawnZDir(piece.color);
    const captureSquare = { x: to.x, y: to.y, z: to.z - zDir };
    captured = removePieceAt(game, captureSquare);
  } else {
    captured = removePieceAt(game, to);
  }

  if (shieldBlocked) {
    const moveRecord = {
      pieceId,
      pieceColor: piece.color,
      pieceType: originalType,
      from,
      to,
      captured: targetBefore ? { id: targetBefore.id, type: targetBefore.type, color: targetBefore.color, shieldBlocked: true } : null,
      shieldBlocked: true,
      wasDoubleStep: false,
      castle: false,
      enPassant: false,
      promotedTo: null,
      atomicRemoved: [],
      time: Date.now()
    };
    game.lastMove = moveRecord;
    game.moveHistory.push(moveRecord);
    game.halfmoveClock = 0;
    return { ok: true, moveRecord };
  }

  if (captured && game.variant === "crazyhouse") {
    if (!game.reserves) game.reserves = { white: [], black: [] };
    if (!Array.isArray(game.reserves[piece.color])) game.reserves[piece.color] = [];
    if (!["king", "wall"].includes(captured.type)) game.reserves[piece.color].push(captured.type);
  }

  if (captured && game.variant === "nuke") addNukeCharge(game, piece.color, 1);

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
  if (atomicRemoved.length) addExplosionEffect(game, to, 1, "atomic");

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

  removePiecesByIds(game, removeIds, removed);
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

  advanceTurn(game, color);
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

export function attemptLaunchNuke(game, playerId, to, options = {}) {
  if (game.status !== "playing") return { ok: false, reason: "Game is not currently playing." };
  if (game.variant !== "nuke") return { ok: false, reason: "Nukes are only available in Nuke." };
  const color = game.turn;
  const devOverride = Boolean(options.devOverride);
  const player = game.players[color];
  if ((!player || player.id !== playerId) && !devOverride) return { ok: false, reason: "You do not control this turn." };
  ensureNukeState(game);
  const state = game.nuke[color];
  if (state.active) return { ok: false, reason: "Your nuke is already active." };
  if ((Number(state.charge) || 0) <= 0) return { ok: false, reason: "Your nuke has no charge." };
  if (!inBounds(to) || to.y !== 0) return { ok: false, reason: "Nukes must be launched onto the 2D board." };
  if (getPieceAt(game, to)) return { ok: false, reason: "Nuke target square must be empty." };
  if (!isNearOwnPiece(game, color, to, 2) && !devOverride) return { ok: false, reason: "Nukes must be launched within 2 squares of one of your pieces." };

  const radius = Math.min(3, Math.max(1, Number(state.charge) || 1));
  state.active = {
    id: `${color}_nuke_${Date.now()}`,
    owner: color,
    centre: { x: to.x, y: 0, z: to.z },
    radius,
    targetTurn: (Number(game.turnToken) || 0) + 6,
    placedAtTurn: Number(game.turnToken) || 0
  };
  state.charge = 0;
  game.lastMove = { nukeLaunch: true, pieceColor: color, pieceType: "nuke", from: null, to: { ...to }, time: Date.now(), radius };
  game.moveHistory.push(game.lastMove);
  game.message = `${color} launched a radius ${radius} nuke.`;
  advanceTurn(game, color);
  return { ok: true, game };
}

export function attemptTycoonAction(game, playerId, actionRaw, to = null, options = {}) {
  if (game.status !== "playing") return { ok: false, reason: "Game is not currently playing." };
  if (game.variant !== "tycoon") return { ok: false, reason: "Tycoon actions are only available in Tycoon." };
  const color = game.turn;
  const devOverride = Boolean(options.devOverride);
  const player = game.players[color];
  if ((!player || player.id !== playerId) && !devOverride) return { ok: false, reason: "You do not control this turn." };
  ensureTycoonState(game);

  const action = String(actionRaw || "").trim();
  const costs = getTycoonCosts(game, color);
  let record = null;

  if (["pawn", "knight", "bishop", "rook", "queen"].includes(action)) {
    if (!to || !inBounds(to) || to.y !== 0) return { ok: false, reason: "Choose a 2D board square for the purchased piece." };
    if (getPieceAt(game, to)) return { ok: false, reason: "Purchase square is occupied." };
    if (!isNearKing(game, color, to, 1)) return { ok: false, reason: "Bought pieces must be placed within one open square of your king." };
    const cost = costs.pieces[action];
    if (!spendTycoonMoney(game, color, cost, devOverride)) return { ok: false, reason: `Not enough money for ${action}.` };
    const piece = { id: `${color}_buy_${action}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, type: action, color, x: to.x, y: 0, z: to.z, hasMoved: true, purchasedTurnToken: Number(game.turnToken) || 0 };
    game.pieces.push(piece);
    record = { tycoon: true, tycoonAction: `buy ${action}`, pieceId: piece.id, pieceColor: color, pieceType: action, from: null, to: { ...to }, cost, time: Date.now() };
  } else if (action === "wall") {
    if (!to || !inBounds(to) || to.y !== 0) return { ok: false, reason: "Choose a 2D board square for the wall." };
    if (getPieceAt(game, to)) return { ok: false, reason: "Wall square is occupied." };
    if (isSiloSquare(to)) return { ok: false, reason: "Walls cannot be placed inside silos." };
    const cost = costs.wall;
    if (!spendTycoonMoney(game, color, cost, devOverride)) return { ok: false, reason: "Not enough money for wall." };
    const wall = { id: `${color}_wall_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, type: "wall", color: "wall", owner: color, x: to.x, y: 0, z: to.z, hasMoved: true };
    game.pieces.push(wall);
    game.tycoon.walls[color] = (game.tycoon.walls[color] || 0) + 1;
    record = { tycoon: true, tycoonAction: "wall", pieceId: wall.id, pieceColor: color, pieceType: "wall", from: null, to: { ...to }, cost, time: Date.now() };
  } else if (action === "shield") {
    if (!to || !inBounds(to)) return { ok: false, reason: "Choose one of your pieces to shield." };
    const target = getPieceAt(game, to);
    if (!target || target.color !== color || target.type === "king" || target.type === "wall") return { ok: false, reason: "Shield must be placed on one of your non-king pieces." };
    if (target.shielded) return { ok: false, reason: "That piece already has a shield." };
    const cost = costs.shield;
    if (!spendTycoonMoney(game, color, cost, devOverride)) return { ok: false, reason: "Not enough money for shield." };
    target.shielded = true;
    record = { tycoon: true, tycoonAction: "shield", pieceId: target.id, pieceColor: color, pieceType: target.type, from: null, to: { ...to }, cost, time: Date.now() };
  } else if (action === "bomb") {
    if (!to || !inBounds(to) || to.y !== 0) return { ok: false, reason: "Choose a 2D board square for the bomb." };
    if (getPieceAt(game, to)) return { ok: false, reason: "Bomb target square must be empty." };
    const cost = costs.bomb;
    if (!spendTycoonMoney(game, color, cost, devOverride)) return { ok: false, reason: "Not enough money for bomb." };
    const bomb = { id: `${color}_bomb_${Date.now()}`, owner: color, centre: { x: to.x, y: 0, z: to.z }, radius: 1, targetTurn: (Number(game.turnToken) || 0) + 6, placedAtTurn: Number(game.turnToken) || 0 };
    game.tycoon.bombs.push(bomb);
    record = { tycoon: true, tycoonAction: "bomb", pieceColor: color, pieceType: "bomb", from: null, to: { ...to }, cost, time: Date.now() };
  } else if (action === "storage") {
    const cost = costs.storage;
    if (!spendTycoonMoney(game, color, cost, devOverride)) return { ok: false, reason: "Not enough money for storage upgrade." };
    game.tycoon.storageLevel[color] = (game.tycoon.storageLevel[color] || 0) + 1;
    game.tycoon.maxMoney[color] = 15 + game.tycoon.storageLevel[color] * 5;
    record = { tycoon: true, tycoonAction: "storage", pieceColor: color, pieceType: "storage", from: null, to: null, cost, time: Date.now() };
  } else if (action === "production") {
    const level = game.tycoon.productionLevel[color] || 0;
    if (level >= 3) return { ok: false, reason: "Production is already maxed." };
    const cost = costs.production;
    if (!spendTycoonMoney(game, color, cost, devOverride)) return { ok: false, reason: "Not enough money for production upgrade." };
    game.tycoon.productionLevel[color] = level + 1;
    game.tycoon.production[color] = level + 1;
    record = { tycoon: true, tycoonAction: "production", pieceColor: color, pieceType: "production", from: null, to: null, cost, time: Date.now() };
  } else {
    return { ok: false, reason: "Unknown Tycoon action." };
  }

  game.lastMove = record;
  game.moveHistory.push(record);
  game.message = `${color} used ${record.tycoonAction}.`;
  game.lastTurnStartedAt = Date.now();
  return { ok: true, game };
}

export function advanceTurn(game, movingColor) {
  game.turn = opponent(movingColor);
  game.turnToken = (Number(game.turnToken) || 0) + 1;
  resolveStartOfTurnEffects(game, game.turn);
  if (game.status !== "finished") {
    Object.assign(game, getGameEndState(game, game.turn));
    applyAutomaticDrawRules(game);
  }
  game.lastTurnStartedAt = game.status === "playing" ? Date.now() : null;
}

function resolveStartOfTurnEffects(game, color) {
  if (!game.effects) game.effects = { explosions: [], income: [] };
  game.effects.explosions = [];
  game.effects.income = [];
  resolvePendingNukes(game);
  resolveTycoonBombs(game);
  awardTycoonIncome(game, color);
}

function addNukeCharge(game, color, amount) {
  ensureNukeState(game);
  const state = game.nuke[color];
  if (state.active) return;
  state.charge = Math.min(3, (Number(state.charge) || 0) + amount);
}

function ensureNukeState(game) {
  if (!game.nuke) game.nuke = { white: { charge: 0, active: null }, black: { charge: 0, active: null } };
  for (const color of ["white", "black"]) {
    if (!game.nuke[color]) game.nuke[color] = { charge: 0, active: null };
  }
}

function resolvePendingNukes(game) {
  if (game.variant !== "nuke" || !game.nuke) return;
  for (const color of ["white", "black"]) {
    const active = game.nuke[color]?.active;
    if (!active || (Number(game.turnToken) || 0) < active.targetTurn) continue;
    const removed = explodeNuke(game, active, color);
    game.nuke[color].active = null;
    addExplosionEffect(game, active.centre, active.radius, "nuke");
    const whiteKingDead = removed.some((piece) => piece.type === "king" && piece.color === "white") || !getKing(game, "white");
    const blackKingDead = removed.some((piece) => piece.type === "king" && piece.color === "black") || !getKing(game, "black");
    if (whiteKingDead && blackKingDead) {
      game.status = "finished";
      game.winner = opponent(color);
      game.message = `${opponent(color)} wins because ${color}'s nuke destroyed both kings.`;
      game.lastTurnStartedAt = null;
    } else if (whiteKingDead || blackKingDead) {
      const winner = whiteKingDead ? "black" : "white";
      game.status = "finished";
      game.winner = winner;
      game.message = `${winner} wins by nuke explosion.`;
      game.lastTurnStartedAt = null;
    }
  }
}

function explodeNuke(game, active, owner) {
  const affected = getNukeAffectedSquares(game, active.centre, active.radius);
  const affectedKeys = new Set(affected.map((pos) => `${pos.x},${pos.y},${pos.z}`));
  const removed = [];
  game.pieces = game.pieces.filter((piece) => {
    if (!affectedKeys.has(`${piece.x},${piece.y},${piece.z}`)) return true;
    if (piece.shielded) {
      piece.shielded = false;
      return true;
    }
    removed.push({ id: piece.id, type: piece.type, color: piece.color, x: piece.x, y: piece.y, z: piece.z });
    return false;
  });
  game.lastMove = { nukeExplosion: true, pieceColor: owner, pieceType: "nuke", from: null, to: { ...active.centre }, radius: active.radius, nukeRemoved: removed, time: Date.now() };
  game.moveHistory.push(game.lastMove);
  return removed;
}

function getNukeAffectedSquares(game, centre, radius) {
  const squares = [];
  for (let x = 0; x < 8; x += 1) {
    for (let z = 0; z < 8; z += 1) {
      const dx = x - centre.x;
      const dz = z - centre.z;
      if (dx * dx + dz * dz > radius * radius) continue;
      const target = { x, y: 0, z };
      if (!isNukeBlockedByRook(game, centre, target)) squares.push(target);
    }
  }
  return squares;
}

function isNukeBlockedByRook(game, centre, target) {
  const sameFile = centre.x === target.x && centre.z !== target.z;
  const sameRank = centre.z === target.z && centre.x !== target.x;
  if (!sameFile && !sameRank) return false;
  const stepX = Math.sign(target.x - centre.x);
  const stepZ = Math.sign(target.z - centre.z);
  let x = centre.x + stepX;
  let z = centre.z + stepZ;
  while (x !== target.x || z !== target.z) {
    const blocker = getPieceAt(game, { x, y: 0, z });
    if (blocker?.type === "rook") return true;
    x += stepX;
    z += stepZ;
  }
  return false;
}

function ensureTycoonState(game) {
  if (!game.tycoon) game.tycoon = { money: { white: 0, black: 0 }, maxMoney: { white: 15, black: 15 }, production: { white: 0, black: 0 }, storageLevel: { white: 0, black: 0 }, productionLevel: { white: 0, black: 0 }, walls: { white: 0, black: 0 }, bombs: [], lastIncome: { white: 0, black: 0 } };
  if (!Array.isArray(game.tycoon.bombs)) game.tycoon.bombs = [];
}

function awardTycoonIncome(game, color) {
  if (game.variant !== "tycoon") return;
  ensureTycoonState(game);
  if ((Number(game.turnToken) || 0) < 2) return;
  const productionBonus = Number(game.tycoon.production[color]) || 0;
  let income = 0;
  for (const piece of game.pieces || []) {
    if (piece.color !== color || piece.type === "wall") continue;
    if (!isSiloSquare(piece)) continue;
    income += tycoonPieceIncome(piece.type) + productionBonus;
  }
  game.tycoon.lastIncome[color] = income;
  if (income > 0) {
    game.tycoon.money[color] = Math.min(game.tycoon.maxMoney[color] || 15, (game.tycoon.money[color] || 0) + income);
    game.effects.income.push({ color, amount: income, time: Date.now() });
  }
}

function resolveTycoonBombs(game) {
  if (game.variant !== "tycoon" || !game.tycoon?.bombs?.length) return;
  const remaining = [];
  for (const bomb of game.tycoon.bombs) {
    if ((Number(game.turnToken) || 0) >= bomb.targetTurn) {
      const removed = explodeTycoonBomb(game, bomb);
      addExplosionEffect(game, bomb.centre, 1, "tycoonBomb");
      game.lastMove = { tycoonExplosion: true, pieceColor: bomb.owner, pieceType: "bomb", from: null, to: { ...bomb.centre }, tycoonRemoved: removed, time: Date.now() };
      game.moveHistory.push(game.lastMove);
    } else {
      remaining.push(bomb);
    }
  }
  game.tycoon.bombs = remaining;
}

function explodeTycoonBomb(game, bomb) {
  const removed = [];
  const keys = new Set();
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dz = -1; dz <= 1; dz += 1) {
      const pos = { x: bomb.centre.x + dx, y: 0, z: bomb.centre.z + dz };
      if (inBounds(pos)) keys.add(`${pos.x},${pos.y},${pos.z}`);
    }
  }
  game.pieces = game.pieces.filter((piece) => {
    if (!keys.has(`${piece.x},${piece.y},${piece.z}`)) return true;
    if (piece.shielded) {
      piece.shielded = false;
      return true;
    }
    removed.push({ id: piece.id, type: piece.type, color: piece.color, owner: piece.owner, x: piece.x, y: piece.y, z: piece.z });
    if (piece.type === "wall" && piece.owner && game.tycoon?.walls?.[piece.owner] > 0) game.tycoon.walls[piece.owner] -= 1;
    return false;
  });
  return removed;
}

function getTycoonCosts(game, color) {
  const storageLevel = game.tycoon?.storageLevel?.[color] || 0;
  const productionLevel = game.tycoon?.productionLevel?.[color] || 0;
  return {
    pieces: { pawn: 3, knight: 7, bishop: 7, rook: 10, queen: 15 },
    wall: 3,
    shield: 5,
    bomb: 5,
    storage: [5, 8, 12, 16, 22][storageLevel] || 28,
    production: [8, 14, 22][productionLevel] || Infinity
  };
}

function spendTycoonMoney(game, color, cost, devOverride = false) {
  ensureTycoonState(game);
  if (devOverride) return true;
  if ((game.tycoon.money[color] || 0) < cost) return false;
  game.tycoon.money[color] -= cost;
  return true;
}

function tycoonPieceIncome(type) {
  if (type === "pawn") return 1;
  if (["rook", "bishop", "knight"].includes(type)) return 2;
  if (type === "queen") return 3;
  if (type === "king") return 5;
  return 0;
}

function isSiloSquare(pos) {
  return pos?.y === 0 && (([1, 2].includes(pos.x) && [3, 4].includes(pos.z)) || ([5, 6].includes(pos.x) && [3, 4].includes(pos.z)));
}

function isNearKing(game, color, to, distance = 1) {
  const king = getKing(game, color);
  if (!king) return false;
  return Math.max(Math.abs(king.x - to.x), Math.abs(king.y - to.y), Math.abs(king.z - to.z)) <= distance;
}

function isNearOwnPiece(game, color, to, distance = 2) {
  return (game.pieces || []).some((piece) => piece.color === color && Math.max(Math.abs(piece.x - to.x), Math.abs(piece.y - to.y), Math.abs(piece.z - to.z)) <= distance);
}

function addExplosionEffect(game, centre, radius, type) {
  if (!game.effects) game.effects = { explosions: [], income: [] };
  game.effects.explosions = [{ centre: { ...centre }, radius, type, time: Date.now() }];
}

function removePiecesByIds(game, ids, removed) {
  game.pieces = game.pieces.filter((piece) => {
    if (!ids.has(piece.id)) return true;
    if (piece.shielded) {
      piece.shielded = false;
      return true;
    }
    removed.push({ id: piece.id, type: piece.type, color: piece.color, owner: piece.owner, x: piece.x, y: piece.y, z: piece.z });
    return false;
  });
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

  advanceTurn(game, movingColor);
  return { ok: true, game };
}
