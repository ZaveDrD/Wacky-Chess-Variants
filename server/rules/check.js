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
  if (isPieceFrozenBySmoke(game, piece)) return [];

  const pseudoMoves = getPseudoLegalMoves(game, piece);
  const withCastling = piece.type === "king" ? [...pseudoMoves, ...getCastleMoves(game, piece)] : pseudoMoves;

  return withCastling.filter((move) => {
    const testGame = cloneGame(game);
    const result = applyMoveUnchecked(testGame, piece.id, move, { promotion: "queen", dryRun: true });
    if (!result?.ok) return false;
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

  if (targetBefore?.god && targetBefore.id !== piece.id) {
    return { ok: false, reason: "That piece is protected by god mode." };
  }

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

  if (game.variant === "scooby") {
    const scoobyResult = triggerScoobyTrapIfNeeded(game, piece, to);
    if (scoobyResult) moveRecord.scoobyTrap = scoobyResult;
  }

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
    if (!piece.god && (directlyInvolved || (adjacent && piece.type !== "pawn"))) removeIds.add(piece.id);
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
  resolveScoobyStartOfTurn(game, color);
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
    if (piece.god) return true;
    if (piece.shielded) {
      piece.shielded = false;
      return true;
    }
    removed.push({ id: piece.id, type: piece.type, color: piece.color, owner: piece.owner, x: piece.x, y: piece.y, z: piece.z });
    return false;
  });
}



function findPredictCandidateMove(game, piece, to) {
  if (!piece || !to || !inBounds(to) || piece.type === "wall") return null;
  if (game.variant !== "threeD" && to.y !== 0) return null;

  const target = getPieceAt(game, to);
  if (target?.type === "wall" || target?.type === "king") return null;

  const candidates = [...getPseudoLegalMoves(game, piece)];
  if (piece.type === "king") candidates.push(...getCastleMoves(game, piece));

  // In Predict, let players intentionally lock moves that are currently unsafe,
  // because the opponent's simultaneous move may remove the attack.
  let chosen = candidates.find((move) => samePos(move, to));
  if (chosen) return chosen;

  // Also allow a player to aim at one of their own currently occupied squares.
  // This represents predicting that the occupant will be captured/moved before
  // resolution. If it is still occupied by the same side at resolution, it fails.
  if (target?.color === piece.color) {
    const testGame = cloneGame(game);
    testGame.pieces = testGame.pieces.filter((candidate) => candidate.id !== target.id);
    const testPiece = getPieceById(testGame, piece.id);
    let predictive = [...getPseudoLegalMoves(testGame, testPiece)];
    if (testPiece?.type === "king") predictive = [...predictive, ...getCastleMoves(testGame, testPiece)];
    chosen = predictive.find((move) => samePos(move, to));
    if (chosen) return { ...chosen, predictiveOwnSquare: true };

    // Pawns need a special case: diagonally moving onto an own piece is a
    // predictive recapture pattern rather than a normal quiet move.
    if (piece.type === "pawn" && to.y === piece.y && Math.abs(to.x - piece.x) === 1 && to.z - piece.z === pawnZDir(piece.color)) {
      return { x: to.x, y: to.y, z: to.z, capture: true, promotion: isPromotionSquare(piece, to, game), predictiveOwnSquare: true };
    }
  }

  return null;
}

function applyPredictPendingMove(game, entry) {
  const piece = getPieceById(game, entry.pieceId);
  if (!piece || piece.color !== entry.color) return { ok: false, reason: `${entry.color}'s predicted piece no longer exists.` };
  const target = getPieceAt(game, entry.to);
  if (target?.color === entry.color && target.id !== piece.id) {
    return { ok: false, reason: `${entry.color}'s predicted square was still occupied by their own ${target.type}.` };
  }
  const move = findPredictCandidateMove(game, piece, entry.to);
  if (!move) return { ok: false, reason: `${entry.color}'s predicted move was no longer possible.` };
  return applyMoveUnchecked(game, entry.pieceId, move, { promotion: entry.promotion || "queen" });
}

function applyPredictFinalCheck(game) {
  const whiteInCheck = isKingInCheck(game, "white");
  const blackInCheck = isKingInCheck(game, "black");
  if (whiteInCheck && blackInCheck) {
    game.check = null;
    game.checkmate = true;
    game.stalemate = false;
    game.winner = null;
    game.status = "finished";
    game.message = "Predict chaos: both kings remained in check. Draw.";
    game.lastTurnStartedAt = null;
    return true;
  }
  if (whiteInCheck || blackInCheck) {
    const loser = whiteInCheck ? "white" : "black";
    game.check = loser;
    game.checkmate = true;
    game.stalemate = false;
    game.winner = opponent(loser);
    game.status = "finished";
    game.message = `${loser}'s prediction failed: their king remained in check. ${opponent(loser)} wins.`;
    game.lastTurnStartedAt = null;
    return true;
  }
  return false;
}

function ensurePredictState(game) {
  if (!game.predict) game.predict = { round: 1, pending: { white: null, black: null } };
  if (!game.predict.pending) game.predict.pending = { white: null, black: null };
}

export function resolvePredictRound(game) {
  ensurePredictState(game);
  const pendingWhite = game.predict.pending.white;
  const pendingBlack = game.predict.pending.black;
  if (!pendingWhite || !pendingBlack) return;

  const resolutionLines = [];
  const whiteResult = applyPredictPendingMove(game, pendingWhite);
  resolutionLines.push(whiteResult.ok ? "white prediction resolved." : whiteResult.reason);

  // Keep the original Predict rule: if White's resolved move checkmates Black,
  // Black's queued move is cancelled.
  if (game.status !== "finished") {
    const afterWhite = getGameEndState(game, "black");
    if (afterWhite.checkmate && afterWhite.winner === "white") {
      Object.assign(game, afterWhite);
      resolutionLines.push("black prediction cancelled because white checkmated first.");
    }
  }

  if (game.status !== "finished") {
    const blackResult = applyPredictPendingMove(game, pendingBlack);
    resolutionLines.push(blackResult.ok ? "black prediction resolved." : blackResult.reason);
  }

  game.predict.pending.white = null;
  game.predict.pending.black = null;
  game.predict.round = (Number(game.predict.round) || 1) + 1;
  game.turn = "white";
  game.turnToken = (Number(game.turnToken) || 0) + 1;
  resolveStartOfTurnEffects(game, "white");

  if (game.status !== "finished" && !applyPredictFinalCheck(game)) {
    Object.assign(game, getGameEndState(game, "white"));
    applyAutomaticDrawRules(game);
  }

  if (game.status === "playing") {
    game.message = `Predict round ${game.predict.round}: ${resolutionLines.filter(Boolean).join(" ")} white to lock a move.`;
  }
  game.lastTurnStartedAt = game.status === "playing" ? Date.now() : null;
}

function ensureScoobyState(game) {
  if (!game.scooby) game.scooby = { traps: [], smokes: [], trapLimits: { mine: 1, pitfall: 2, smoke: 1, decoy: 2, mindControl: 1 } };
  if (!Array.isArray(game.scooby.traps)) game.scooby.traps = [];
  if (!Array.isArray(game.scooby.smokes)) game.scooby.smokes = [];
  if (!game.scooby.trapLimits) game.scooby.trapLimits = { mine: 1, pitfall: 2, smoke: 1, decoy: 2, mindControl: 1 };
}

function trapKey(pos) {
  return `${pos.x},${pos.y},${pos.z}`;
}

function isBackTwoRanks(pos) {
  return [0, 1, 6, 7].includes(pos?.z);
}

function activeTrapCount(game, color, type) {
  ensureScoobyState(game);
  return game.scooby.traps.filter((trap) => trap.owner === color && trap.type === type).length;
}

function createDecoyAppearance(pos) {
  const types = ["mine", "pitfall", "smoke", "mindControl"];
  const index = Math.abs((Number(pos.x) || 0) * 17 + (Number(pos.z) || 0) * 13) % types.length;
  return types[index];
}

function scoobyMineSquares(pos) {
  return [
    pos,
    { x: pos.x + 1, y: 0, z: pos.z },
    { x: pos.x - 1, y: 0, z: pos.z },
    { x: pos.x, y: 0, z: pos.z + 1 },
    { x: pos.x, y: 0, z: pos.z - 1 }
  ].filter(inBounds);
}

function isPieceFrozenBySmoke(game, piece) {
  if (game?.variant !== "scooby" || !piece || piece.y !== 0 || !game.scooby?.smokes?.length) return false;
  return game.scooby.smokes.some((smoke) => (Number(game.turnToken) || 0) < (Number(smoke.expiresAtTurn) || 0) && Math.abs(piece.x - smoke.centre.x) <= 2 && Math.abs(piece.z - smoke.centre.z) <= 2);
}

function resolveScoobyStartOfTurn(game, color) {
  if (game.variant !== "scooby") return;
  ensureScoobyState(game);
  game.scooby.smokes = (game.scooby.smokes || []).filter((smoke) => (Number(game.turnToken) || 0) < (Number(smoke.expiresAtTurn) || 0));
  for (const piece of game.pieces || []) {
    if (piece.controlledUntilTurn != null && (Number(game.turnToken) || 0) >= Number(piece.controlledUntilTurn)) {
      piece.color = piece.originalColor || piece.color;
      delete piece.controlledBy;
      delete piece.controlledUntilTurn;
      delete piece.originalColor;
    }
  }
}

function removePiecesAtSquares(game, positions) {
  const keys = new Set(positions.filter(inBounds).map((pos) => trapKey(pos)));
  const removed = [];
  game.pieces = game.pieces.filter((piece) => {
    if (!keys.has(trapKey(piece))) return true;
    if (piece.shielded) {
      piece.shielded = false;
      return true;
    }
    removed.push({ id: piece.id, type: piece.type, color: piece.color, x: piece.x, y: piece.y, z: piece.z });
    return false;
  });
  return removed;
}

function triggerScoobyTrapIfNeeded(game, piece, to) {
  if (game.variant !== "scooby") return null;
  ensureScoobyState(game);
  const index = game.scooby.traps.findIndex((trap) => samePos(trap.pos, to));
  if (index < 0) return null;
  const [trap] = game.scooby.traps.splice(index, 1);
  const result = { type: trap.type, owner: trap.owner, pos: { ...trap.pos } };

  if (trap.type === "mine") {
    const affected = scoobyMineSquares(to);
    result.removed = removePiecesAtSquares(game, affected);
    addExplosionEffect(game, to, 1, "scoobyMine");
  } else if (trap.type === "pitfall") {
    result.removed = removePiecesAtSquares(game, [to]);
  } else if (trap.type === "smoke") {
    const expiresAtTurn = (Number(game.turnToken) || 0) + 6;
    game.scooby.smokes.push({ owner: trap.owner, centre: { ...to }, expiresAtTurn });
    result.expiresAtTurn = expiresAtTurn;
  } else if (trap.type === "decoy") {
    result.decoy = true;
  } else if (trap.type === "mindControl") {
    if (piece.type !== "king") {
      piece.originalColor = piece.originalColor || piece.color;
      piece.color = trap.owner;
      piece.controlledBy = trap.owner;
      piece.controlledUntilTurn = (Number(game.turnToken) || 0) + 4;
      result.controlledUntilTurn = piece.controlledUntilTurn;
    } else {
      result.immune = true;
    }
  }

  return result;
}

export function attemptScoobyAction(game, playerId, actionRaw, to = null, options = {}) {
  if (game.status !== "playing") return { ok: false, reason: "Game is not currently playing." };
  if (game.variant !== "scooby") return { ok: false, reason: "Scooby actions are only available in Scooby." };
  const color = game.turn;
  const devOverride = Boolean(options.devOverride);
  const player = game.players[color];
  if ((!player || player.id !== playerId) && !devOverride) return { ok: false, reason: "You do not control this turn." };
  ensureScoobyState(game);
  const action = String(actionRaw || "").trim();
  const recordBase = { scooby: true, scoobyAction: action, pieceColor: color, pieceType: action, from: null, to: to ? { ...to } : null, time: Date.now() };

  if (action === "defuse") {
    if (!to || !inBounds(to) || to.y !== 0) return { ok: false, reason: "Choose a board square to defuse." };
    const index = game.scooby.traps.findIndex((trap) => samePos(trap.pos, to));
    const success = index >= 0;
    let removedTrap = null;
    if (success) {
      [removedTrap] = game.scooby.traps.splice(index, 1);
    }
    const record = { ...recordBase, scoobyAction: success ? `defuse ${removedTrap.type}` : "defuse fail", success, trapType: removedTrap?.type || null };
    game.lastMove = record;
    game.moveHistory.push(record);
    game.message = success ? `${color} successfully defused a ${removedTrap.type} trap.` : `${color} failed to defuse a trap.`;
    advanceTurn(game, color);
    return { ok: true, game };
  }

  if (!to || !inBounds(to) || to.y !== 0) return { ok: false, reason: "Choose an empty 2D board square for that trap." };
  if (isBackTwoRanks(to)) return { ok: false, reason: "Traps cannot be placed on the back two ranks." };
  if (getPieceAt(game, to)) return { ok: false, reason: "Traps can only be placed on empty squares." };
  if (game.scooby.traps.some((trap) => samePos(trap.pos, to))) return { ok: false, reason: "There is already a trap on that square." };
  if (!Object.keys(game.scooby.trapLimits).includes(action)) return { ok: false, reason: "Unknown Scooby trap." };
  if (activeTrapCount(game, color, action) >= (game.scooby.trapLimits[action] || 0) && !devOverride) return { ok: false, reason: `You are out of ${action} traps.` };

  const trap = {
    id: `${color}_${action}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    owner: color,
    type: action,
    pos: { x: to.x, y: 0, z: to.z },
    apparentType: action === "decoy" ? createDecoyAppearance(to) : action,
    placedAtTurn: Number(game.turnToken) || 0
  };
  game.scooby.traps.push(trap);
  const record = { ...recordBase, scoobyAction: `place ${action}`, trapType: action };
  game.lastMove = record;
  game.moveHistory.push(record);
  game.message = `${color} placed a ${action} trap.`;
  advanceTurn(game, color);
  return { ok: true, game };
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

  let chosen = null;

  if (game.variant === "predict") {
    chosen = findPredictCandidateMove(game, piece, to);
    if (!chosen) return { ok: false, reason: "Illegal Predict move." };
    ensurePredictState(game);
    game.predict.pending[movingColor] = { pieceId, color: movingColor, to: { x: chosen.x, y: chosen.y, z: chosen.z }, promotion: options.promotion || "queen" };
    if (movingColor === "white") {
      game.turn = "black";
      game.message = "Predict: white locked a move. black is now choosing blindly.";
      game.lastTurnStartedAt = Date.now();
    } else {
      game.message = "Predict: black locked a move. Resolving both moves.";
      resolvePredictRound(game);
    }
    return { ok: true, game };
  }

  const legalMoves = getLegalMoves(game, piece);
  chosen = legalMoves.find((move) => move.x === to.x && move.y === to.y && move.z === to.z);
  if (!chosen) return { ok: false, reason: "Illegal move." };

  const result = applyMoveUnchecked(game, pieceId, chosen, options);
  if (!result.ok) return result;

  advanceTurn(game, movingColor);
  return { ok: true, game };
}
