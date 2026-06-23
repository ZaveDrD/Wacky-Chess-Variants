import { getLegalMoves, applyMoveUnchecked, getGameEndState, applyAutomaticDrawRules, advanceTurn, attemptLegalDrop, attemptLaunchNuke, attemptTycoonAction, attemptLegalMove, attemptScoobyAction } from "./check.js";
import { cloneGame, getPieceAt, getPositionRepeatCount, opponent, pawnZDir, positionSignature, samePos } from "./utils.js";

const PIECE_VALUES = {
  pawn: 100,
  knight: 320,
  bishop: 330,
  rook: 500,
  queen: 900,
  king: 20000
};

const DIFFICULTY_DEPTH = {
  easy: 0,
  medium: 1,
  hard: 2
};

const MAX_BRANCHING = {
  normal: 32,
  threeD: 10
};

const DRAW_AVOIDANCE_SCORE = 260000;
const REPEAT_AVOIDANCE_SCORE = 22000;
const HANGING_MATING_PIECE_PENALTY = 52000;
const WON_ENDGAME_BONUS = 18000;

export function normaliseAIDifficulty(value) {
  return ["easy", "medium", "hard"].includes(value) ? value : "medium";
}


function getAIDifficultyForTurn(game) {
  return normaliseAIDifficulty(game?.ai?.difficulties?.[game.turn] || game?.ai?.difficulty);
}

export function isAITurn(game) {
  if (!game?.ai?.enabled || game.status !== "playing" || game.ai?.paused) return false;
  const activePlayer = game.players?.[game.turn];
  const aiColors = Array.isArray(game.ai.colors) ? game.ai.colors : [game.ai.color].filter(Boolean);
  return Boolean(aiColors.includes(game.turn) || String(activePlayer?.id || "").startsWith("AI:"));
}

export function runAIMove(game) {
  if (!isAITurn(game)) return { ok: false, reason: "It is not the AI turn." };

  const aiPlayerId = getActiveAIPlayerId(game);

  // Tycoon shop actions are intentionally prep actions now: the AI can buy several
  // things, then still make a normal chess move to end its turn.
  if (game.variant === "tycoon") {
    runTycoonAIPurchases(game, aiPlayerId);
    if (game.status !== "playing") return { ok: true, game };
  }

  // Crazyhouse drops are a move, so use them only when they look useful.
  if (game.variant === "crazyhouse") {
    const dropChoice = chooseCrazyhouseDrop(game, game.turn);
    if (dropChoice) {
      const result = attemptLegalDrop(game, aiPlayerId, dropChoice.pieceType, dropChoice.to, {});
      if (result.ok) {
        if (game.lastMove) {
          game.lastMove.ai = true;
          game.lastMove.aiDifficulty = getAIDifficultyForTurn(game);
        }
        return { ok: true, game, moveRecord: game.lastMove };
      }
    }
  }

  // Nuke launches are a move. Fire when the blast is valuable enough, or at max charge.
  if (game.variant === "nuke") {
    const launchChoice = chooseNukeLaunch(game, game.turn);
    if (launchChoice) {
      const result = attemptLaunchNuke(game, aiPlayerId, launchChoice.to, {});
      if (result.ok) {
        if (game.lastMove) {
          game.lastMove.ai = true;
          game.lastMove.aiDifficulty = getAIDifficultyForTurn(game);
        }
        return { ok: true, game, moveRecord: game.lastMove };
      }
    }
  }


  if (game.variant === "scooby") {
    const scoobyChoice = chooseScoobyAction(game, game.turn);
    if (scoobyChoice) {
      const result = attemptScoobyAction(game, aiPlayerId, scoobyChoice.action, scoobyChoice.to, {});
      if (result.ok) {
        if (game.lastMove) {
          game.lastMove.ai = true;
          game.lastMove.aiDifficulty = getAIDifficultyForTurn(game);
        }
        return { ok: true, game, moveRecord: game.lastMove };
      }
    }
  }

  const moveChoice = chooseAIMove(game);
  if (!moveChoice) {
    Object.assign(game, getGameEndState(game, game.turn));
    game.lastTurnStartedAt = game.status === "playing" ? Date.now() : null;
    return { ok: false, reason: "AI has no legal moves." };
  }

  if (game.variant === "predict") {
    const result = attemptLegalMove(game, aiPlayerId, moveChoice.pieceId, moveChoice.move, { promotion: "queen" });
    if (!result.ok) return result;
    if (game.lastMove) {
      game.lastMove.ai = true;
      game.lastMove.aiDifficulty = getAIDifficultyForTurn(game);
    }
    return { ok: true, game, moveRecord: game.lastMove };
  }

  const result = applyMoveUnchecked(game, moveChoice.pieceId, moveChoice.move, { promotion: "queen" });
  if (!result.ok) return result;

  if (result.moveRecord) {
    result.moveRecord.ai = true;
    result.moveRecord.aiDifficulty = getAIDifficultyForTurn(game);
  }

  advanceTurn(game, moveChoice.piece.color);

  return { ok: true, game, moveRecord: result.moveRecord };
}



function getActiveAIPlayerId(game) {
  const player = game.players?.[game.turn];
  return player?.id || `AI:${game.roomCode || "room"}:${game.turn}`;
}

function chooseCrazyhouseDrop(game, color) {
  const reserve = game.reserves?.[color] || [];
  if (!reserve.length) return null;

  const candidates = [];
  for (const pieceType of uniqueReserveTypes(reserve)) {
    for (const to of empty2DSquares(game)) {
      if (pieceType === "pawn" && (to.z === 0 || to.z === 7)) continue;
      const test = cloneGame(game);
      const playerId = test.players?.[color]?.id || getActiveAIPlayerId(test);
      const result = attemptLegalDrop(test, playerId, pieceType, to, {});
      if (!result.ok) continue;
      const score = scoreDropCandidate(test, color, pieceType, to);
      candidates.push({ pieceType, to, score });
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);

  const best = candidates[0];
  const shouldDrop =
    best.score >= 520 ||
    reserve.length >= 3 ||
    getAllLegalMoves(game, color).length <= 3 ||
    Math.random() < 0.18;

  return shouldDrop ? best : null;
}

function scoreDropCandidate(gameAfterDrop, color, pieceType, to) {
  const value = PIECE_VALUES[pieceType] || 0;
  const enemy = opponent(color);
  let score = value * 0.45;
  score += centerScore(to) * 42;
  if (gameAfterDrop.check === enemy) score += 900;
  if (pieceType === "pawn") {
    score += (color === "white" ? to.z : 7 - to.z) * 55;
  }
  const enemyKing = gameAfterDrop.pieces.find((piece) => piece.color === enemy && piece.type === "king");
  if (enemyKing) {
    const d = Math.abs(enemyKing.x - to.x) + Math.abs(enemyKing.z - to.z);
    score += Math.max(0, 7 - d) * 70;
  }
  return score + Math.random() * 20;
}

function uniqueReserveTypes(reserve) {
  return [...new Set(reserve.filter((type) => ["pawn", "knight", "bishop", "rook", "queen"].includes(type)))];
}

function chooseScoobyAction(game, color) {
  const scooby = game.scooby;
  if (!scooby) return null;
  if (Math.random() > 0.28) return null;

  const placeable = empty2DSquares(game).filter((to) => ![0,1,6,7].includes(to.z));
  const enemyPieces = (game.pieces || []).filter((piece) => piece.color !== color && piece.type !== "king" && piece.y === 0);

  for (const enemy of enemyPieces) {
    const defuseTarget = { x: enemy.x, y: 0, z: enemy.z };
    if ((scooby.traps || []).some((trap) => trap.pos.x === defuseTarget.x && trap.pos.z === defuseTarget.z)) {
      return { action: "defuse", to: defuseTarget };
    }
  }

  const trapOrder = ["pitfall", "mine", "smoke", "mindControl", "decoy"];
  for (const trapType of trapOrder) {
    const limit = scooby.trapLimits?.[trapType] || 0;
    const activeCount = (scooby.traps || []).filter((trap) => trap.owner === color && trap.type === trapType).length;
    if (activeCount >= limit) continue;
    const target = placeable
      .map((to) => ({ to, score: scoreScoobySquare(game, color, to, trapType) }))
      .sort((a, b) => b.score - a.score)[0];
    if (target && target.score > 0) return { action: trapType, to: target.to };
  }

  return null;
}

function scoreScoobySquare(game, color, to, trapType) {
  const enemy = opponent(color);
  let score = centerScore(to) * 10 + Math.random() * 8;
  for (const piece of game.pieces || []) {
    if (piece.color !== enemy || piece.y !== 0) continue;
    const distance = Math.abs(piece.x - to.x) + Math.abs(piece.z - to.z);
    if (trapType === "pitfall") score += Math.max(0, 7 - distance) * 18;
    if (trapType === "mine") score += Math.max(0, 6 - distance) * 14;
    if (trapType === "smoke") score += Math.max(0, 5 - distance) * 12;
    if (trapType === "mindControl") score += Math.max(0, 6 - distance) * (piece.type === "queen" ? 28 : 14);
    if (trapType === "decoy") score += Math.max(0, 6 - distance) * 9;
  }
  return score;
}

function chooseNukeLaunch(game, color) {
  const state = game.nuke?.[color];
  const charge = Math.min(3, Math.max(0, Number(state?.charge) || 0));
  if (!charge || state?.active) return null;

  const candidates = [];
  for (const to of empty2DSquares(game)) {
    if (!isWithinDistanceOfOwnPiece(game, color, to, 2)) continue;
    const score = scoreNukeTarget(game, color, to, charge);
    candidates.push({ to, score });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  if (charge >= 3 && best.score > 350) return best;
  if (charge >= 2 && best.score > 1200) return best;
  if (charge >= 1 && best.score > 3600) return best;
  return null;
}

function scoreNukeTarget(game, color, centre, radius) {
  const enemy = opponent(color);
  let score = 0;
  let ownKingHit = false;
  let enemyKingHit = false;

  for (const piece of game.pieces || []) {
    if (piece.type === "wall") continue;
    if (!isCircularHit(centre, piece, radius)) continue;
    if (isNukeBlockedByRookForAI(game, centre, piece)) continue;
    const value = PIECE_VALUES[piece.type] || 0;
    if (piece.color === enemy) score += value * (piece.type === "king" ? 10 : 1.25);
    if (piece.color === color) score -= value * (piece.type === "king" ? 12 : 1);
    if (piece.type === "king" && piece.color === color) ownKingHit = true;
    if (piece.type === "king" && piece.color === enemy) enemyKingHit = true;
  }

  if (enemyKingHit && !ownKingHit) score += 180000;
  if (enemyKingHit && ownKingHit) score -= 250000; // launcher loses if both kings die
  if (ownKingHit && !enemyKingHit) score -= 180000;
  score += centerScore(centre) * 20;
  return score + Math.random() * 12;
}

function runTycoonAIPurchases(game, playerId) {
  ensureTycoonShapeForAI(game);
  const color = game.turn;
  let actions = 0;

  // Keep the AI from dumping the entire bank every turn, but let it use mechanics.
  while (actions < 4 && game.status === "playing") {
    const action = chooseTycoonAction(game, color);
    if (!action) break;
    const result = attemptTycoonAction(game, playerId, action.action, action.to, {});
    if (!result.ok) break;
    if (game.lastMove) {
      game.lastMove.ai = true;
      game.lastMove.aiDifficulty = getAIDifficultyForTurn(game);
    }
    actions += 1;
  }
}

function chooseTycoonAction(game, color) {
  const tycoon = game.tycoon;
  const money = Number(tycoon?.money?.[color]) || 0;
  const costs = getTycoonCostsForAI(game, color);
  const enemy = opponent(color);

  if ((tycoon.productionLevel?.[color] || 0) < 2 && money >= costs.production + 4 && countSiloPieces(game, color) >= 2) {
    return { action: "production", to: null };
  }

  if ((tycoon.storageLevel?.[color] || 0) < 3 && money >= costs.storage + 3 && money >= (tycoon.maxMoney?.[color] || 15) - 2) {
    return { action: "storage", to: null };
  }

  if (money >= costs.bomb && !hasPendingBomb(game, color)) {
    const bombTarget = bestTycoonBombTarget(game, color);
    if (bombTarget?.score >= 650) return { action: "bomb", to: bombTarget.to };
  }

  if (money >= costs.shield) {
    const shieldTarget = bestShieldTarget(game, color);
    if (shieldTarget) return { action: "shield", to: shieldTarget };
  }

  const pieceBuy = chooseTycoonPieceBuy(game, color, costs, money);
  if (pieceBuy) return pieceBuy;

  if (money >= costs.wall && Math.random() < 0.22) {
    const wallSquare = chooseWallSquare(game, color, enemy);
    if (wallSquare) return { action: "wall", to: wallSquare };
  }

  return null;
}

function chooseTycoonPieceBuy(game, color, costs, money) {
  const options = [];
  for (const [type, cost] of Object.entries(costs.pieces)) {
    if (money < cost) continue;
    for (const to of kingAdjacentEmptySquares(game, color)) {
      let score = (PIECE_VALUES[type] || 0) / Math.max(1, cost);
      score += centerScore(to) * 8;
      if (isSiloSquareForAI(to)) score += 45;
      if (type === "pawn") score += color === "white" ? to.z * 5 : (7 - to.z) * 5;
      if (type === "queen" && money < cost + 4) score -= 30;
      options.push({ action: type, to, score });
    }
  }
  if (!options.length) return null;
  options.sort((a, b) => b.score - a.score);
  const best = options[0];
  if (best.action === "queen" && countMaterialPieces(game, color) >= 10 && Math.random() < 0.45) return null;
  return best.score > 28 || Math.random() < 0.16 ? best : null;
}

function bestTycoonBombTarget(game, color) {
  const enemy = opponent(color);
  let best = null;
  for (const to of empty2DSquares(game)) {
    let score = 0;
    for (const piece of game.pieces || []) {
      if (Math.max(Math.abs(piece.x - to.x), Math.abs(piece.z - to.z)) > 1 || piece.y !== 0) continue;
      const value = piece.type === "wall" ? 230 : (PIECE_VALUES[piece.type] || 0);
      if (piece.color === enemy || piece.owner === enemy) score += value;
      if (piece.color === color || piece.owner === color) score -= value * 0.85;
    }
    if (!best || score > best.score) best = { to, score };
  }
  return best;
}

function bestShieldTarget(game, color) {
  const pieces = (game.pieces || [])
    .filter((piece) => piece.color === color && !piece.shielded && !["king", "pawn", "wall"].includes(piece.type))
    .sort((a, b) => (PIECE_VALUES[b.type] || 0) - (PIECE_VALUES[a.type] || 0));
  if (!pieces.length) return null;
  const valuable = pieces[0];
  if ((PIECE_VALUES[valuable.type] || 0) >= 500 || Math.random() < 0.2) return { x: valuable.x, y: valuable.y, z: valuable.z };
  return null;
}

function chooseWallSquare(game, color, enemy) {
  const enemyKing = game.pieces.find((piece) => piece.color === enemy && piece.type === "king");
  const candidates = empty2DSquares(game).filter((sq) => !isSiloSquareForAI(sq));
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const aScore = centerScore(a) + (enemyKing ? 4 - manhattan2D(a, enemyKing) : 0);
    const bScore = centerScore(b) + (enemyKing ? 4 - manhattan2D(b, enemyKing) : 0);
    return bScore - aScore;
  });
  return candidates[0];
}

function getTycoonCostsForAI(game, color) {
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

function ensureTycoonShapeForAI(game) {
  if (!game.tycoon) game.tycoon = {};
  game.tycoon.money ||= { white: 0, black: 0 };
  game.tycoon.maxMoney ||= { white: 15, black: 15 };
  game.tycoon.production ||= { white: 0, black: 0 };
  game.tycoon.storageLevel ||= { white: 0, black: 0 };
  game.tycoon.productionLevel ||= { white: 0, black: 0 };
  game.tycoon.bombs ||= [];
}

function countSiloPieces(game, color) {
  return (game.pieces || []).filter((piece) => piece.color === color && isSiloSquareForAI(piece)).length;
}

function countMaterialPieces(game, color) {
  return (game.pieces || []).filter((piece) => piece.color === color && !["king", "wall"].includes(piece.type)).length;
}

function hasPendingBomb(game, color) {
  return (game.tycoon?.bombs || []).some((bomb) => bomb.owner === color);
}

function kingAdjacentEmptySquares(game, color) {
  const king = game.pieces.find((piece) => piece.color === color && piece.type === "king");
  if (!king) return [];
  const squares = [];
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dz = -1; dz <= 1; dz += 1) {
      if (dx === 0 && dz === 0) continue;
      const to = { x: king.x + dx, y: 0, z: king.z + dz };
      if (!inBounds2D(to)) continue;
      if (!getPieceAt(game, to)) squares.push(to);
    }
  }
  return squares;
}

function empty2DSquares(game) {
  const squares = [];
  for (let x = 0; x < 8; x += 1) {
    for (let z = 0; z < 8; z += 1) {
      const to = { x, y: 0, z };
      if (!getPieceAt(game, to)) squares.push(to);
    }
  }
  return squares;
}

function isWithinDistanceOfOwnPiece(game, color, to, distance) {
  return (game.pieces || []).some((piece) => piece.color === color && Math.max(Math.abs(piece.x - to.x), Math.abs(piece.z - to.z)) <= distance && piece.y === 0);
}

function isCircularHit(centre, target, radius) {
  const dx = target.x - centre.x;
  const dz = target.z - centre.z;
  return dx * dx + dz * dz <= radius * radius;
}

function isNukeBlockedByRookForAI(game, centre, target) {
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

function isSiloSquareForAI(pos) {
  return pos?.y === 0 && (([1, 2].includes(pos.x) && [3, 4].includes(pos.z)) || ([5, 6].includes(pos.x) && [3, 4].includes(pos.z)));
}

function inBounds2D(pos) {
  return Number.isInteger(pos.x) && Number.isInteger(pos.z) && pos.x >= 0 && pos.x < 8 && pos.z >= 0 && pos.z < 8;
}

function centerScore(pos) {
  return (3.5 - Math.abs(3.5 - pos.x)) + (3.5 - Math.abs(3.5 - pos.z));
}

function manhattan2D(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}

export function chooseAIMove(game) {
  const color = game.turn;
  const legalMoves = getAllLegalMoves(game, color);
  if (legalMoves.length === 0) return null;

  const difficulty = getAIDifficultyForTurn(game);

  if (difficulty === "easy") {
    return legalMoves[Math.floor(Math.random() * legalMoves.length)];
  }

  const ranked = rankCandidates(game, legalMoves, color);

  if (difficulty === "medium") {
    return pickStrategicCandidate(game, ranked, color, 5) || ranked[0]?.candidate || legalMoves[0];
  }

  const depth = getSearchDepth(game, difficulty);
  const strategic = prioritiseCandidates(game, ranked, color);
  const limited = strategic.slice(0, MAX_BRANCHING[game.variant] || MAX_BRANCHING.normal).map((entry) => entry.candidate);
  let best = null;
  let bestScore = -Infinity;
  let alpha = -Infinity;
  const beta = Infinity;

  for (const candidate of limited) {
    const nextGame = simulateCandidate(game, candidate, true);
    const score = minimax(nextGame, depth - 1, color, alpha, beta) + quickMoveScore(game, candidate, color) * 0.015;
    const jitter = Math.random() * 0.01;
    if (score + jitter > bestScore) {
      bestScore = score + jitter;
      best = candidate;
    }
    alpha = Math.max(alpha, bestScore);
  }

  return best || pickStrategicCandidate(game, ranked, color, 3) || ranked[0]?.candidate || legalMoves[0];
}

function getSearchDepth(game, difficulty) {
  if (game?.variant === "threeD") {
    if (difficulty === "hard") return 1;
    if (difficulty === "medium") return 0;
  }
  return DIFFICULTY_DEPTH[difficulty] || 1;
}

function minimax(game, depth, aiColor, alpha, beta) {
  if (depth <= 0 || game.status !== "playing") return evaluateBoard(game, aiColor);

  const color = game.turn;
  const legalMoves = getAllLegalMoves(game, color);
  if (legalMoves.length === 0) return evaluateBoard(game, aiColor);

  const ranked = prioritiseCandidates(game, rankCandidates(game, legalMoves, color), color).slice(
    0,
    MAX_BRANCHING[game.variant] || MAX_BRANCHING.normal
  );

  if (color === aiColor) {
    let value = -Infinity;
    for (const { candidate } of ranked) {
      value = Math.max(value, minimax(simulateCandidate(game, candidate, true), depth - 1, aiColor, alpha, beta));
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return value;
  }

  let value = Infinity;
  for (const { candidate } of ranked) {
    value = Math.min(value, minimax(simulateCandidate(game, candidate, true), depth - 1, aiColor, alpha, beta));
    beta = Math.min(beta, value);
    if (alpha >= beta) break;
  }
  return value;
}

export function getAllAICandidates(game, color) {
  return getAllLegalMoves(game, color);
}

export function evaluateAIPosition(game, color) {
  return evaluateBoard(game, color);
}

export function scoreAICandidates(game, color) {
  return rankCandidates(game, getAllLegalMoves(game, color), color).map(({ candidate, score }) => ({
    score,
    pieceId: candidate.pieceId,
    pieceType: candidate.piece.type,
    from: { x: candidate.piece.x, y: candidate.piece.y, z: candidate.piece.z },
    to: { x: candidate.move.x, y: candidate.move.y, z: candidate.move.z },
    capture: Boolean(candidate.move.capture)
  }));
}

function getAllLegalMoves(game, color) {
  const moves = [];
  for (const piece of game.pieces) {
    if (piece.color !== color) continue;
    for (const move of getLegalMoves(game, piece)) {
      moves.push({ pieceId: piece.id, piece, move });
    }
  }
  return moves;
}

function rankCandidates(game, legalMoves, color) {
  return legalMoves
    .map((candidate) => ({ candidate, score: quickMoveScore(game, candidate, color) }))
    .sort((a, b) => b.score - a.score);
}

function prioritiseCandidates(game, ranked, color) {
  if (ranked.length <= 1) return ranked;

  const nonDrawing = ranked.filter(({ candidate }) => !wouldImmediatelyDraw(game, candidate));
  const pool = nonDrawing.length > 0 ? nonDrawing : ranked;

  const nonRepeating = pool.filter(({ candidate }) => !wouldRepeatKnownPosition(game, candidate));
  const repeatFiltered = nonRepeating.length > 0 ? nonRepeating : pool;

  const halfmoveClock = Number(game.halfmoveClock) || 0;
  if (halfmoveClock >= 45) {
    const progressMoves = repeatFiltered.filter(({ candidate }) => makesMaterialOrPawnProgress(game, candidate));
    if (progressMoves.length > 0) return progressMoves;
  }

  const nonSterile = repeatFiltered.filter(({ candidate }) => !wouldCreateSterileEndgame(game, candidate, color));
  const sterileFiltered = nonSterile.length > 0 ? nonSterile : repeatFiltered;

  const captureOrThreatMoves = sterileFiltered.filter(({ candidate }) => {
    const nextGame = simulateCandidate(game, candidate, true);
    const safety = moveSafetyScore(game, candidate, nextGame, color);
    const tacticallyUseful = Boolean(getCapturedPiece(game, candidate)) || candidate.piece.type === "pawn" || nextGame.check === opponent(color);
    return tacticallyUseful && safety > -HANGING_MATING_PIECE_PENALTY * 0.5;
  });

  if (captureOrThreatMoves.length > 0 && isEndgame(game)) {
    return captureOrThreatMoves;
  }

  return sterileFiltered;
}

function pickStrategicCandidate(game, ranked, color, topCount) {
  const pool = prioritiseCandidates(game, ranked, color);
  return pickFromTop(pool, topCount);
}

function quickMoveScore(game, candidate, color) {
  const piece = candidate.piece;
  const move = candidate.move;
  let score = Math.random() * 4;

  const captured = getCapturedPiece(game, candidate);
  if (captured) {
    score += PIECE_VALUES[captured.type] * 7.5;
    score -= PIECE_VALUES[piece.type] * 0.85;

    // In won endgames, do not let the AI grab irrelevant material if the move hangs
    // one of the remaining mating pieces. It is better to keep the winning piece safe
    // than to win a low-value capture and simplify into stalemate material.
    if (isWonMaterialEndgame(game, color) && PIECE_VALUES[piece.type] >= 300) {
      score -= PIECE_VALUES[piece.type] * 0.45;
    }
  }

  if (move.promotedTo || move.promotion || wouldPromote(piece, move, game)) score += 8500;
  if (move.castle) score += 450;
  if (move.enPassant) score += 1000;

  const nextGame = simulateCandidate(game, candidate, true);
  const repeatPenalty = repetitionPenalty(game, candidate, nextGame);
  score -= repeatPenalty;
  score += moveSafetyScore(game, candidate, nextGame, color);
  score += wonEndgamePlanScore(game, candidate, nextGame, color);

  if (nextGame.status === "finished") {
    if (nextGame.winner === color) score += 1000000;
    else if (nextGame.winner === opponent(color)) score -= 1000000;
    else score -= DRAW_AVOIDANCE_SCORE;
  }

  if (nextGame.check === opponent(color)) score += 900;
  if (nextGame.check === color) score -= 600;

  score += matingMaterialScore(nextGame, color);

  const halfmoveClock = Number(game.halfmoveClock) || 0;
  if (halfmoveClock > 25) {
    const progressMove = makesMaterialOrPawnProgress(game, candidate);
    if (progressMove) score += 3500 + halfmoveClock * 140;
    else score -= halfmoveClock * 95;
  }

  score += pawnProgressScore(game, candidate) * 42;
  score += kingPressureScore(game, nextGame, color) * (isEndgame(game) ? 75 : 12);
  score += evaluateBoard(nextGame, color) * 0.08;

  return score;
}


function moveSafetyScore(game, candidate, nextGame, color) {
  if (nextGame.status === "finished" && nextGame.winner === color) return 0;

  const opponentColor = opponent(color);
  const ownMaterial = nonKingMaterialValue(game, color);
  const enemyMaterial = nonKingMaterialValue(game, opponentColor);
  const wonEndgame = isWonMaterialEndgame(game, color);
  const endgame = isEndgame(game);
  let score = 0;

  const opponentCaptures = getOpponentCaptureThreats(nextGame, opponentColor, color);
  if (opponentCaptures.length === 0) return score + protectedMatingMaterialBonus(nextGame, color);

  const movedPieceThreat = opponentCaptures.find((threat) => threat.captured?.id === candidate.pieceId);
  if (movedPieceThreat) {
    const value = PIECE_VALUES[candidate.piece.type] || 0;
    const isMatingPiece = candidate.piece.type !== "king" && candidate.piece.type !== "pawn";
    let penalty = value * 8;
    if (endgame) penalty += value * 6;
    if (wonEndgame) penalty += HANGING_MATING_PIECE_PENALTY;
    if (isMatingPiece && enemyMaterial <= 250) penalty += value * 10;
    score -= penalty;
  }

  // If the opponent has only a king or almost no material, any move that allows them
  // to take a rook/queen/bishop/knight is usually catastrophic for actually finishing.
  for (const threat of opponentCaptures) {
    const capturedValue = PIECE_VALUES[threat.captured?.type] || 0;
    if (capturedValue <= 0) continue;
    let penalty = capturedValue * 1.6;
    if (wonEndgame && threat.captured.type !== "pawn") penalty += capturedValue * 7;
    if (ownMaterial - capturedValue < 500 && enemyMaterial < 500) penalty += HANGING_MATING_PIECE_PENALTY;
    score -= penalty;
  }

  return score + protectedMatingMaterialBonus(nextGame, color);
}

function getOpponentCaptureThreats(game, opponentColor, targetColor) {
  const threats = [];
  for (const piece of game.pieces || []) {
    if (piece.color !== opponentColor) continue;
    for (const move of getLegalMoves(game, piece)) {
      const captured = getCapturedPiece(game, { pieceId: piece.id, piece, move });
      if (captured && captured.color === targetColor) {
        threats.push({ attacker: piece, move, captured, value: PIECE_VALUES[captured.type] || 0 });
      }
    }
  }
  return threats.sort((a, b) => b.value - a.value);
}

function protectedMatingMaterialBonus(game, color) {
  if (!isWonMaterialEndgame(game, color)) return 0;
  const pieces = (game.pieces || []).filter((piece) => piece.color === color && piece.type !== "king");
  const ownKing = game.pieces.find((piece) => piece.color === color && piece.type === "king");
  const enemyKing = game.pieces.find((piece) => piece.color === opponent(color) && piece.type === "king");
  if (!ownKing || !enemyKing) return 0;

  let score = 0;
  for (const piece of pieces) {
    const value = PIECE_VALUES[piece.type] || 0;
    if (value >= 300) {
      const ownKingDistance = manhattanDistance(ownKing, piece);
      const enemyKingDistance = manhattanDistance(enemyKing, piece);
      if (ownKingDistance <= 2) score += 1200;
      if (enemyKingDistance <= 1) score -= 4000;
      if (enemyKingDistance <= ownKingDistance && ownKingDistance > 2) score -= 2200;
    }
  }
  return score;
}

function wonEndgamePlanScore(game, candidate, nextGame, color) {
  if (!isWonMaterialEndgame(game, color)) return 0;

  const enemyKingBefore = game.pieces.find((piece) => piece.color === opponent(color) && piece.type === "king");
  const enemyKingAfter = nextGame.pieces.find((piece) => piece.color === opponent(color) && piece.type === "king");
  const ownKingAfter = nextGame.pieces.find((piece) => piece.color === color && piece.type === "king");
  if (!enemyKingBefore || !enemyKingAfter || !ownKingAfter) return 0;

  let score = WON_ENDGAME_BONUS;
  const beforeCornerDistance = distanceToNearestCorner(enemyKingBefore, game.variant);
  const afterCornerDistance = distanceToNearestCorner(enemyKingAfter, nextGame.variant);
  score += (beforeCornerDistance - afterCornerDistance) * 3200;
  score -= afterCornerDistance * 520;

  const ownKingDistance = manhattanDistance(ownKingAfter, enemyKingAfter);
  score += Math.max(0, 7 - ownKingDistance) * 900;

  const movedPieceAfter = nextGame.pieces.find((piece) => piece.id === candidate.pieceId);
  if (movedPieceAfter && ["rook", "queen"].includes(movedPieceAfter.type)) {
    score += majorPieceConfinementScore(movedPieceAfter, enemyKingAfter, nextGame.variant);
  }

  if (candidate.piece.type === "king") score += 1800;
  if (candidate.piece.type === "pawn") score += pawnProgressScore(game, candidate) * 110;

  return score;
}

function majorPieceConfinementScore(piece, enemyKing, variant) {
  let score = 0;
  if (piece.x === enemyKing.x) score += 1500;
  if (piece.z === enemyKing.z) score += 1500;
  if (variant === "threeD" && piece.y === enemyKing.y) score += 1500;

  const distance = manhattanDistance(piece, enemyKing);
  if (distance <= 1) score -= 6000;
  if (distance >= 2 && distance <= 5) score += 900;
  return score;
}

function distanceToNearestCorner(piece, variant) {
  const yOptions = variant === "threeD" ? [0, 7] : [0];
  let best = Infinity;
  for (const x of [0, 7]) {
    for (const y of yOptions) {
      for (const z of [0, 7]) {
        best = Math.min(best, Math.abs(piece.x - x) + Math.abs(piece.y - y) + Math.abs(piece.z - z));
      }
    }
  }
  return best;
}

function isWonMaterialEndgame(game, color) {
  if (!isEndgame(game)) return false;
  const ownMaterial = nonKingMaterialValue(game, color);
  const enemyMaterial = nonKingMaterialValue(game, opponent(color));
  if (ownMaterial < 500) return false;
  if (enemyMaterial > 350) return false;
  return hasLikelyMatingMaterial(game, color);
}

function wouldImmediatelyDraw(game, candidate) {
  const nextGame = simulateCandidate(game, candidate, true);
  if (nextGame.status !== "finished") return false;
  return !nextGame.winner;
}

function wouldRepeatKnownPosition(game, candidate) {
  const nextGame = simulateCandidate(game, candidate, true);
  const signature = positionSignature(nextGame);
  return getPositionRepeatCount(game, signature) > 0;
}

function wouldCreateSterileEndgame(game, candidate, color) {
  const beforeTotal = nonKingMaterialValue(game, "white") + nonKingMaterialValue(game, "black");
  const nextGame = simulateCandidate(game, candidate, true);
  const afterTotal = nonKingMaterialValue(nextGame, "white") + nonKingMaterialValue(nextGame, "black");
  if (nextGame.status === "finished" && nextGame.winner === color) return false;

  const ownHasMaterial = hasLikelyMatingMaterial(nextGame, color);
  const enemyHasMaterial = hasLikelyMatingMaterial(nextGame, opponent(color));
  if (!ownHasMaterial && !enemyHasMaterial) return true;
  if (beforeTotal >= 1200 && afterTotal < 700) return true;
  return false;
}

function makesMaterialOrPawnProgress(game, candidate) {
  if (getCapturedPiece(game, candidate)) return true;
  if (candidate.piece.type !== "pawn") return false;
  const from = candidate.piece;
  const to = candidate.move;
  return Math.abs(to.z - from.z) > 0 || Math.abs(to.y - from.y) > 0;
}

function repetitionPenalty(game, candidate, nextGame) {
  if (nextGame.status === "finished" && nextGame.winner === candidate.piece.color) return 0;

  let penalty = 0;
  const signature = positionSignature(nextGame);
  const previousCount = getPositionRepeatCount(game, signature);
  if (previousCount > 0) penalty += previousCount * REPEAT_AVOIDANCE_SCORE;

  const recentOwnMove = [...(game.moveHistory || [])]
    .reverse()
    .find((move) => move.pieceId === candidate.pieceId);

  if (recentOwnMove && samePos(candidate.move, recentOwnMove.from)) {
    penalty += 9500;
  }

  const lastMove = game.lastMove;
  if (lastMove && candidate.pieceId === lastMove.pieceId && samePos(candidate.move, lastMove.from)) {
    penalty += 14000;
  }

  if (nextGame.status === "finished" && !nextGame.winner) {
    penalty += DRAW_AVOIDANCE_SCORE;
  }

  return penalty;
}

function evaluateBoard(game, aiColor) {
  if (game.status === "finished" || game.status === "abandoned") {
    if (game.winner === aiColor) return 1000000;
    if (game.winner === opponent(aiColor)) return -1000000;
    return -DRAW_AVOIDANCE_SCORE;
  }

  let score = 0;
  for (const piece of game.pieces) {
    const sign = piece.color === aiColor ? 1 : -1;
    score += sign * (PIECE_VALUES[piece.type] || 0);
    score += sign * positionalBonus(piece, game);
  }

  if (game.check === opponent(aiColor)) score += 40;
  if (game.check === aiColor) score -= 70;

  score += matingMaterialScore(game, aiColor);
  score += kingPressureScore(null, game, aiColor) * (isEndgame(game) ? 60 : 8);
  score -= passiveShufflePenalty(game, aiColor);

  return score;
}

function positionalBonus(piece, game) {
  const centerX = 3.5 - Math.abs(3.5 - piece.x);
  const centerZ = 3.5 - Math.abs(3.5 - piece.z);
  const centerY = game.variant === "threeD" ? 3.5 - Math.abs(3.5 - piece.y) : 0;
  const center = centerX + centerZ + centerY * 0.45;

  if (piece.type === "pawn") {
    const progress = piece.color === "white" ? piece.z : 7 - piece.z;
    const vertical = game.variant === "threeD" ? piece.y * 0.8 : 0;
    return progress * 9 + vertical * 6 + center * 1.8;
  }

  if (piece.type === "king") return game.moveHistory.length < 16 ? -center * 2 : center * 2.7;
  return center * 6;
}

function simulateCandidate(game, candidate, evaluateEnd = false) {
  const nextGame = cloneGame(game);
  const result = applyMoveUnchecked(nextGame, candidate.pieceId, candidate.move, { promotion: "queen" });
  if (!result.ok) return nextGame;
  nextGame.turn = opponent(nextGame.turn);
  Object.assign(nextGame, getGameEndState(nextGame, nextGame.turn));
  if (evaluateEnd) applyAutomaticDrawRules(nextGame);
  return nextGame;
}

function getCapturedPiece(game, candidate) {
  const { piece, move } = candidate;
  if (move.enPassant) {
    const zDir = pawnZDir(piece.color);
    return getPieceAt(game, { x: move.x, y: move.y, z: move.z - zDir });
  }
  return getPieceAt(game, move);
}

function wouldPromote(piece, move, game) {
  if (piece.type !== "pawn") return false;
  if (piece.color === "white") return move.z === 7 || (game.variant === "threeD" && move.y === 7);
  return move.z === 0 || (game.variant === "threeD" && move.y === 7);
}

function matingMaterialScore(game, color) {
  const ownHasMaterial = hasLikelyMatingMaterial(game, color);
  const opponentHasMaterial = hasLikelyMatingMaterial(game, opponent(color));

  if (ownHasMaterial && !opponentHasMaterial) return 4500;
  if (!ownHasMaterial && opponentHasMaterial) return -18000;
  if (!ownHasMaterial && !opponentHasMaterial) return -900000;

  const ownMaterial = nonKingMaterialValue(game, color);
  const enemyMaterial = nonKingMaterialValue(game, opponent(color));

  // In AI matches, avoid simplifying too hard into sterile king-only endings.
  if (ownMaterial + enemyMaterial < 900 && game.pieces.some((piece) => piece.type === "pawn")) return 2200;
  if (ownMaterial + enemyMaterial < 700) return -65000;
  return 0;
}

function hasLikelyMatingMaterial(game, color) {
  const pieces = (game.pieces || []).filter((piece) => piece.color === color && piece.type !== "king");
  if (pieces.some((piece) => ["queen", "rook", "pawn"].includes(piece.type))) return true;
  const bishops = pieces.filter((piece) => piece.type === "bishop").length;
  const knights = pieces.filter((piece) => piece.type === "knight").length;
  return bishops + knights >= 2;
}

function nonKingMaterialValue(game, color) {
  return (game.pieces || [])
    .filter((piece) => piece.color === color && piece.type !== "king")
    .reduce((total, piece) => total + (PIECE_VALUES[piece.type] || 0), 0);
}

function pawnProgressScore(game, candidate) {
  const { piece, move } = candidate;
  if (piece.type !== "pawn") return 0;

  const fromProgress = piece.color === "white" ? piece.z : 7 - piece.z;
  const toProgress = piece.color === "white" ? move.z : 7 - move.z;
  const zGain = toProgress - fromProgress;
  const yGain = game.variant === "threeD" ? move.y - piece.y : 0;
  return zGain * 12 + yGain * 8;
}

function kingPressureScore(_previousGame, nextGame, color) {
  const enemyKing = nextGame.pieces.find((piece) => piece.color === opponent(color) && piece.type === "king");
  if (!enemyKing) return 0;

  const ownPieces = nextGame.pieces.filter((piece) => piece.color === color && piece.type !== "king");
  const ownKing = nextGame.pieces.find((piece) => piece.color === color && piece.type === "king");
  let score = 0;

  for (const piece of ownPieces) {
    const distance = manhattanDistance(piece, enemyKing);
    score += Math.max(0, 12 - distance) * (piece.type === "queen" || piece.type === "rook" ? 2.5 : 1);
  }

  if (ownKing) {
    score += Math.max(0, 12 - manhattanDistance(ownKing, enemyKing)) * 0.8;
  }

  return score;
}

function passiveShufflePenalty(game, color) {
  const recent = (game.moveHistory || []).slice(-8).filter((move) => move.pieceColor === color);
  if (recent.length < 4) return 0;

  let penalty = 0;
  for (let index = 1; index < recent.length; index += 1) {
    const previous = recent[index - 1];
    const current = recent[index];
    if (
      previous.pieceId &&
      current.pieceId &&
      previous.from &&
      previous.to &&
      current.from &&
      current.to &&
      previous.pieceId === current.pieceId &&
      samePos(previous.from, current.to) &&
      samePos(previous.to, current.from)
    ) {
      penalty += 900;
    }
  }
  return penalty;
}

function isEndgame(game) {
  const nonKingMaterial = (game.pieces || [])
    .filter((piece) => piece.type !== "king")
    .reduce((total, piece) => total + (PIECE_VALUES[piece.type] || 0), 0);
  return nonKingMaterial <= 2400 || (game.moveHistory || []).length >= 50;
}

function manhattanDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
}

function weightedRandom(scoredCandidates) {
  const ranked = scoredCandidates.sort((a, b) => b.score - a.score);
  const pool = ranked.slice(0, Math.min(ranked.length, Math.max(8, Math.ceil(ranked.length * 0.65))));
  return pool[Math.floor(Math.random() * pool.length)]?.candidate || ranked[0]?.candidate || null;
}

function pickFromTop(ranked, count) {
  const pool = ranked.slice(0, Math.min(count, ranked.length));
  return pool[Math.floor(Math.random() * pool.length)]?.candidate || ranked[0]?.candidate || null;
}
