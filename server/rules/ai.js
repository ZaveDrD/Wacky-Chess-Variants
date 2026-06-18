import { getLegalMoves, applyMoveUnchecked, getGameEndState, applyAutomaticDrawRules } from "./check.js";
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
  normal: 44,
  threeD: 32
};

const DRAW_AVOIDANCE_SCORE = 260000;
const REPEAT_AVOIDANCE_SCORE = 22000;

export function normaliseAIDifficulty(value) {
  return ["easy", "medium", "hard"].includes(value) ? value : "medium";
}

export function isAITurn(game) {
  if (!game?.ai?.enabled || game.status !== "playing") return false;
  const activePlayer = game.players?.[game.turn];
  const aiColors = Array.isArray(game.ai.colors) ? game.ai.colors : [game.ai.color].filter(Boolean);
  return Boolean(aiColors.includes(game.turn) || String(activePlayer?.id || "").startsWith("AI:"));
}

export function runAIMove(game) {
  if (!isAITurn(game)) return { ok: false, reason: "It is not the AI turn." };

  const moveChoice = chooseAIMove(game);
  if (!moveChoice) {
    Object.assign(game, getGameEndState(game, game.turn));
    game.lastTurnStartedAt = game.status === "playing" ? Date.now() : null;
    return { ok: false, reason: "AI has no legal moves." };
  }

  const result = applyMoveUnchecked(game, moveChoice.pieceId, moveChoice.move, { promotion: "queen" });
  if (!result.ok) return result;

  if (result.moveRecord) {
    result.moveRecord.ai = true;
    result.moveRecord.aiDifficulty = game.ai.difficulty;
  }

  game.turn = opponent(game.turn);
  Object.assign(game, getGameEndState(game, game.turn));
  applyAutomaticDrawRules(game);
  game.lastTurnStartedAt = game.status === "playing" ? Date.now() : null;

  return { ok: true, game, moveRecord: result.moveRecord };
}

export function chooseAIMove(game) {
  const color = game.turn;
  const legalMoves = getAllLegalMoves(game, color);
  if (legalMoves.length === 0) return null;

  const difficulty = normaliseAIDifficulty(game.ai?.difficulty);
  const ranked = rankCandidates(game, legalMoves, color);

  if (difficulty === "easy") {
    const safePool = ranked.filter(({ candidate }) => !wouldImmediatelyDraw(game, candidate));
    const pool = safePool.length > 0 ? safePool : ranked;
    return weightedRandom(pool.map(({ candidate, score }) => ({ candidate, score })));
  }

  if (difficulty === "medium") {
    return pickStrategicCandidate(game, ranked, color, 5) || ranked[0]?.candidate || legalMoves[0];
  }

  const depth = DIFFICULTY_DEPTH[difficulty] || 1;
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
    return Boolean(getCapturedPiece(game, candidate)) || candidate.piece.type === "pawn" || nextGame.check === opponent(color);
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
  }

  if (move.promotedTo || move.promotion || wouldPromote(piece, move, game)) score += 8500;
  if (move.castle) score += 450;
  if (move.enPassant) score += 1000;

  const nextGame = simulateCandidate(game, candidate, true);
  const repeatPenalty = repetitionPenalty(game, candidate, nextGame);
  score -= repeatPenalty;

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
    if (previous.pieceId === current.pieceId && samePos(previous.from, current.to) && samePos(previous.to, current.from)) {
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
