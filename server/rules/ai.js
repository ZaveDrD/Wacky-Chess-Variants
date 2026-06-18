import { getLegalMoves, applyMoveUnchecked, getGameEndState } from "./check.js";
import { cloneGame, getPieceAt, opponent, pawnZDir } from "./utils.js";

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
  game.lastTurnStartedAt = game.status === "playing" ? Date.now() : null;

  return { ok: true, game, moveRecord: result.moveRecord };
}

export function chooseAIMove(game) {
  const color = game.turn;
  const legalMoves = getAllLegalMoves(game, color);
  if (legalMoves.length === 0) return null;

  const difficulty = normaliseAIDifficulty(game.ai?.difficulty);
  if (difficulty === "easy") {
    return weightedRandom(legalMoves.map((candidate) => ({ candidate, score: quickMoveScore(game, candidate, color) })));
  }

  const ranked = rankCandidates(game, legalMoves, color);
  if (difficulty === "medium") {
    return pickFromTop(ranked, 3);
  }

  const depth = DIFFICULTY_DEPTH[difficulty] || 1;
  const limited = ranked.slice(0, MAX_BRANCHING[game.variant] || MAX_BRANCHING.normal).map((entry) => entry.candidate);
  let best = null;
  let bestScore = -Infinity;
  let alpha = -Infinity;
  const beta = Infinity;

  for (const candidate of limited) {
    const nextGame = simulateCandidate(game, candidate);
    const score = minimax(nextGame, depth - 1, color, alpha, beta);
    const jitter = Math.random() * 0.01;
    if (score + jitter > bestScore) {
      bestScore = score + jitter;
      best = candidate;
    }
    alpha = Math.max(alpha, bestScore);
  }

  return best || ranked[0]?.candidate || legalMoves[0];
}

function minimax(game, depth, aiColor, alpha, beta) {
  if (depth <= 0 || game.status !== "playing") return evaluateBoard(game, aiColor);

  const color = game.turn;
  const legalMoves = getAllLegalMoves(game, color);
  if (legalMoves.length === 0) return evaluateBoard(game, aiColor);

  const ranked = rankCandidates(game, legalMoves, color).slice(0, MAX_BRANCHING[game.variant] || MAX_BRANCHING.normal);

  if (color === aiColor) {
    let value = -Infinity;
    for (const { candidate } of ranked) {
      value = Math.max(value, minimax(simulateCandidate(game, candidate), depth - 1, aiColor, alpha, beta));
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return value;
  }

  let value = Infinity;
  for (const { candidate } of ranked) {
    value = Math.min(value, minimax(simulateCandidate(game, candidate), depth - 1, aiColor, alpha, beta));
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

function quickMoveScore(game, candidate, color) {
  const piece = candidate.piece;
  const move = candidate.move;
  let score = Math.random() * 4;

  const captured = getCapturedPiece(game, candidate);
  if (captured) {
    score += PIECE_VALUES[captured.type] * 10;
    score -= PIECE_VALUES[piece.type] * 0.6;
  }

  if (move.promotedTo || move.promotion || wouldPromote(piece, move, game)) score += 8500;
  if (move.castle) score += 450;
  if (move.enPassant) score += 1000;

  const nextGame = simulateCandidate(game, candidate);
  if (nextGame.status === "finished") {
    if (nextGame.winner === color) score += 1000000;
    else if (nextGame.winner === opponent(color)) score -= 1000000;
    else score -= 500;
  }

  if (nextGame.check === opponent(color)) score += 800;
  score += evaluateBoard(nextGame, color) * 0.08;

  return score;
}

function evaluateBoard(game, aiColor) {
  if (game.status === "finished" || game.status === "abandoned") {
    if (game.winner === aiColor) return 1000000;
    if (game.winner === opponent(aiColor)) return -1000000;
    return 0;
  }

  let score = 0;
  for (const piece of game.pieces) {
    const sign = piece.color === aiColor ? 1 : -1;
    score += sign * (PIECE_VALUES[piece.type] || 0);
    score += sign * positionalBonus(piece, game);
  }

  if (game.check === opponent(aiColor)) score += 35;
  if (game.check === aiColor) score -= 55;

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
    return progress * 7 + vertical * 4 + center * 1.8;
  }

  if (piece.type === "king") return game.moveHistory.length < 16 ? -center * 2 : center * 2;
  return center * 6;
}

function simulateCandidate(game, candidate) {
  const nextGame = cloneGame(game);
  const result = applyMoveUnchecked(nextGame, candidate.pieceId, candidate.move, { promotion: "queen" });
  if (!result.ok) return nextGame;
  nextGame.turn = opponent(nextGame.turn);
  Object.assign(nextGame, getGameEndState(nextGame, nextGame.turn));
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

function weightedRandom(scoredCandidates) {
  const ranked = scoredCandidates.sort((a, b) => b.score - a.score);
  // Easy still prefers non-suicidal/capturing moves slightly, but stays visibly beatable.
  const pool = ranked.slice(0, Math.min(ranked.length, Math.max(8, Math.ceil(ranked.length * 0.65))));
  return pool[Math.floor(Math.random() * pool.length)]?.candidate || ranked[0]?.candidate || null;
}

function pickFromTop(ranked, count) {
  const pool = ranked.slice(0, Math.min(count, ranked.length));
  return pool[Math.floor(Math.random() * pool.length)]?.candidate || ranked[0]?.candidate || null;
}
