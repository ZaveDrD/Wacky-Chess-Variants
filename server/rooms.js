import { customAlphabet } from "nanoid";
import { createGame, TIME_CONTROLS } from "./rules/setup.js";
import { getGameEndState, getLegalMoves, isKingInCheck, isSquareAttacked } from "./rules/check.js";
import { cloneGame, getPieceAt, getPieceById, inBounds, opponent, recordCurrentPosition, removePieceAt } from "./rules/utils.js";

const nanoid = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);
export const rooms = new Map();

export const ROOM_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
export const CLOSED_ROOM_REPLAY_GRACE_MS = 60 * 60 * 1000;


export function createRoom(hostSocket, hostName, options = {}) {
  let roomCode = nanoid();
  while (rooms.has(roomCode)) roomCode = nanoid();

  const game = createGame(roomCode, options);
  game.players.white = {
    id: hostSocket.id,
    name: cleanName(hostName) || "White"
  };

  if (options.publicMatch) {
    game.publicMatch = true;
    game.message = "Waiting for quick match opponent.";
  }

  if (game.ai?.enabled) {
    game.ai.colors = ["black"];
    game.players.black = {
      id: `AI:${roomCode}:black`,
      name: `AI ${capitalise(game.ai.difficulty)}`
    };
    game.status = "playing";
    game.publicMatch = false;
    game.message = "white to move.";
    game.lastTurnStartedAt = Date.now();
    ensureInitialPositionRecorded(game);
  }

  rooms.set(roomCode, game);
  hostSocket.join(roomCode);
  return game;
}

export function findPublicMatch(options = {}) {
  const scope = options.scope === "any" ? "any" : "selected";
  const variant = options.variant;
  const timeControl = options.timeControl;

  return Array.from(rooms.values()).find((game) => {
    if (!game.publicMatch) return false;
    if (game.status !== "waiting") return false;
    if (!game.players.white || game.players.black) return false;
    if (game.ai?.enabled || game.gameMode === "ai") return false;
    if (scope !== "any") {
      if (variant && game.variant !== variant) return false;
      if (timeControl && game.timeControl !== timeControl) return false;
    }
    return true;
  }) || null;
}

export function quickMatch(socket, playerName, options = {}) {
  const existing = findPublicMatch(options);
  if (existing) {
    const result = joinRoom(socket, existing.roomCode, playerName);
    if (!result.ok) return result;
    existing.publicMatch = false;
    existing.matchmakingScope = options.scope === "any" ? "any" : "selected";
    return {
      ...result,
      matched: true,
      created: false,
      roomCode: existing.roomCode,
      scope: existing.matchmakingScope
    };
  }

  const game = createRoom(socket, playerName, {
    variant: options.variant,
    timeControl: options.timeControl,
    gameMode: "online",
    publicMatch: true
  });
  game.matchmakingScope = options.scope === "any" ? "any" : "selected";
  return {
    ok: true,
    game,
    roomCode: game.roomCode,
    color: "white",
    role: "player",
    matched: false,
    created: true,
    scope: game.matchmakingScope
  };
}

export function cancelQuickMatch(socketId) {
  for (const [roomCode, game] of rooms.entries()) {
    if (!game.publicMatch || game.status !== "waiting") continue;
    if (game.players.white?.id !== socketId) continue;
    rooms.delete(roomCode);
    return { ok: true, roomCode };
  }
  return { ok: false, reason: "No active quick match search." };
}


export function createDevMatch(socket, playerName, options = {}) {
  let roomCode = nanoid();
  while (rooms.has(roomCode)) roomCode = nanoid();

  const botCount = Math.min(2, Math.max(0, Number.parseInt(options.botCount, 10) || 0));
  const game = createGame(roomCode, {
    variant: options.variant,
    timeControl: options.timeControl,
    gameMode: botCount > 0 ? "ai" : "online",
    aiDifficulty: options.aiDifficulty
  });

  if (botCount === 2) {
    game.ai.enabled = true;
    game.ai.colors = ["white", "black"];
    game.ai.color = "white";
    game.players.white = {
      id: `AI:${roomCode}:white`,
      name: `AI ${capitalise(game.ai.difficulty)} White`
    };
    game.players.black = {
      id: `AI:${roomCode}:black`,
      name: `AI ${capitalise(game.ai.difficulty)} Black`
    };
    game.spectators.push({
      id: socket.id,
      name: cleanName(playerName) || "Developer"
    });
    game.status = "playing";
    game.message = "white to move.";
    game.lastTurnStartedAt = Date.now();
    ensureInitialPositionRecorded(game);
    rooms.set(roomCode, game);
    socket.join(roomCode);
    return { ok: true, game, roomCode, color: "spectator", role: "spectator" };
  }

  game.players.white = {
    id: socket.id,
    name: cleanName(playerName) || "White"
  };

  if (botCount === 1) {
    game.ai.enabled = true;
    game.ai.colors = ["black"];
    game.ai.color = "black";
    game.players.black = {
      id: `AI:${roomCode}:black`,
      name: `AI ${capitalise(game.ai.difficulty)}`
    };
    game.status = "playing";
    game.message = "white to move.";
    game.lastTurnStartedAt = Date.now();
    ensureInitialPositionRecorded(game);
  }

  rooms.set(roomCode, game);
  socket.join(roomCode);
  return { ok: true, game, roomCode, color: "white", role: "player" };
}

export function spectateRoom(socket, roomCodeRaw, playerName) {
  const roomCode = String(roomCodeRaw ?? "").trim().toUpperCase();
  const game = rooms.get(roomCode);
  if (!game) return { ok: false, reason: "Room not found." };

  socket.join(roomCode);

  if (game.players.white?.id === socket.id) return { ok: true, game, roomCode, color: "white", role: "player" };
  if (game.players.black?.id === socket.id) return { ok: true, game, roomCode, color: "black", role: "player" };

  const existingSpectator = game.spectators.find((spectator) => spectator.id === socket.id);
  if (!existingSpectator) {
    game.spectators.push({
      id: socket.id,
      name: cleanName(playerName) || `Spectator ${game.spectators.length + 1}`
    });
  }

  return { ok: true, game, roomCode, color: "spectator", role: "spectator" };
}

export function getOpenMatches() {
  return Array.from(rooms.values())
    .filter((game) => game.status !== "finished" && game.status !== "abandoned")
    .map((game) => ({
      roomCode: game.roomCode,
      variant: game.variant,
      variantName: game.variantName,
      timeControl: game.timeControl,
      gameMode: game.gameMode,
      status: game.status,
      turn: game.turn,
      white: game.players.white?.name || null,
      black: game.players.black?.name || null,
      spectators: game.spectators?.length || 0,
      moveCount: game.moveHistory?.length || 0,
      hasAI: Boolean(game.ai?.enabled)
    }));
}

export function getRoomSnapshot(roomCodeRaw) {
  const roomCode = String(roomCodeRaw ?? "").trim().toUpperCase();
  const game = rooms.get(roomCode);
  if (!game) return null;
  return {
    roomCode: game.roomCode,
    variant: game.variant,
    variantName: game.variantName,
    timeControl: game.timeControl,
    gameMode: game.gameMode,
    status: game.status,
    turn: game.turn,
    white: game.players.white?.name || null,
    black: game.players.black?.name || null,
    spectators: game.spectators?.length || 0,
    moveCount: game.moveHistory?.length || 0,
    hasAI: Boolean(game.ai?.enabled),
    aiColors: game.ai?.colors || [],
    winner: game.winner || null,
    message: game.message || ""
  };
}

export function leaveCurrentRooms(socket, socketId) {
  const affected = [];

  for (const [roomCode, game] of rooms.entries()) {
    let changed = false;
    const color = game.players.white?.id === socketId ? "white" : game.players.black?.id === socketId ? "black" : null;

    if (color) {
      if (game.status === "waiting") {
        rooms.delete(roomCode);
        socket.leave(roomCode);
        changed = true;
      } else if (game.status === "playing") {
        tickGameClock(game);
        game.status = "abandoned";
        markRoomClosed(game);
        game.winner = color === "white" ? "black" : "white";
        game.message = `${game.winner} wins because ${color} exited the match.`;
        game.lastTurnStartedAt = null;
        socket.leave(roomCode);
        changed = true;
      } else {
        socket.leave(roomCode);
      }
    } else {
      const before = game.spectators?.length || 0;
      game.spectators = (game.spectators || []).filter((spectator) => spectator.id !== socketId);
      if (game.spectators.length !== before) {
        socket.leave(roomCode);
        changed = true;
      }
    }

    if (changed && rooms.has(roomCode)) affected.push(game);
  }

  return affected;
}

export function joinRoom(socket, roomCodeRaw, playerName) {
  const roomCode = String(roomCodeRaw ?? "").trim().toUpperCase();
  const game = rooms.get(roomCode);
  if (!game) return { ok: false, reason: "Room not found." };

  socket.join(roomCode);

  if (!game.players.black) {
    game.players.black = {
      id: socket.id,
      name: cleanName(playerName) || "Black"
    };
    game.status = "playing";
    game.publicMatch = false;
    game.message = "white to move.";
    game.lastTurnStartedAt = Date.now();
    ensureInitialPositionRecorded(game);
    return { ok: true, game, color: "black", role: "player" };
  }

  const existingSpectator = game.spectators.find((spectator) => spectator.id === socket.id);
  if (!existingSpectator) {
    game.spectators.push({
      id: socket.id,
      name: cleanName(playerName) || `Spectator ${game.spectators.length + 1}`
    });
  }

  return { ok: true, game, color: "spectator", role: "spectator" };
}

export function getRoomForSocket(socketId) {
  for (const game of rooms.values()) {
    if (game.players.white?.id === socketId || game.players.black?.id === socketId) return game;
    if (game.spectators?.some((spectator) => spectator.id === socketId)) return game;
  }
  return null;
}


export function cleanupExpiredRooms(now = Date.now()) {
  const removed = [];

  for (const [roomCode, game] of rooms.entries()) {
    const isClosed = game.status === "finished" || game.status === "abandoned";
    if (!isClosed) continue;

    const closedAt = game.closedAt || game.finishedAt || game.abandonedAt || game.updatedAt || game.createdAt || now;
    const hasHumanPlayer = Boolean(
      game.players.white && !String(game.players.white.id || "").startsWith("AI:") ||
      game.players.black && !String(game.players.black.id || "").startsWith("AI:")
    );
    const spectatorCount = game.spectators?.length || 0;
    const replayGraceExpired = now - closedAt >= CLOSED_ROOM_REPLAY_GRACE_MS;

    if (!hasHumanPlayer && spectatorCount === 0 && replayGraceExpired) {
      rooms.delete(roomCode);
      removed.push(roomCode);
    }
  }

  return removed;
}

function markRoomClosed(game) {
  if (!game.closedAt) game.closedAt = Date.now();
  game.updatedAt = Date.now();
}

export function removeSocketFromRooms(socketId) {
  const affected = [];

  for (const [roomCode, game] of rooms.entries()) {
    const color = game.players.white?.id === socketId ? "white" : game.players.black?.id === socketId ? "black" : null;

    if (!color) {
      const before = game.spectators?.length || 0;
      game.spectators = (game.spectators || []).filter((spectator) => spectator.id !== socketId);
      if (game.spectators.length !== before) affected.push(game);
      continue;
    }

    if (game.status === "waiting") {
      rooms.delete(roomCode);
      continue;
    }

    if (game.status === "playing") tickGameClock(game);
    if (game.status === "finished" || game.status === "abandoned") continue;

    game.status = "abandoned";
    markRoomClosed(game);
    game.winner = color === "white" ? "black" : "white";
    game.message = `${game.winner} wins because ${color} disconnected.`;
    game.lastTurnStartedAt = null;
    affected.push(game);
  }

  return affected;
}

export function getLegalMovesForSocket(socketId, roomCodeRaw, pieceId) {
  const roomCode = String(roomCodeRaw ?? "").trim().toUpperCase();
  const game = rooms.get(roomCode);
  if (!game) return { ok: false, reason: "Room not found." };
  tickGameClock(game);
  if (game.status !== "playing") return { ok: false, reason: "Game is not currently playing." };

  const piece = getPieceById(game, pieceId);
  if (!piece) return { ok: false, reason: "Piece not found." };

  const override = hasDevMoveOverride(game, socketId);
  const player = game.players[piece.color];
  if ((!player || player.id !== socketId) && !override) return { ok: false, reason: "You do not control that piece." };
  if (piece.color !== game.turn && !override) return { ok: false, reason: "It is not your turn." };

  return { ok: true, legalMoves: getLegalMoves(game, piece), game };
}

export function forfeitGame(socketId, roomCodeRaw) {
  const roomCode = String(roomCodeRaw ?? "").trim().toUpperCase();
  const game = rooms.get(roomCode);
  if (!game) return { ok: false, reason: "Room not found." };
  if (game.status === "playing") tickGameClock(game);
  if (game.status === "finished" || game.status === "abandoned") {
    return { ok: false, reason: "Game is already over." };
  }

  const color = game.players.white?.id === socketId ? "white" : game.players.black?.id === socketId ? "black" : null;
  if (!color) return { ok: false, reason: "Only active players can forfeit." };

  const winner = color === "white" ? "black" : "white";
  game.status = "finished";
  markRoomClosed(game);
  game.winner = winner;
  game.forfeit = true;
  game.forfeitedBy = color;
  game.message = `${winner} wins because ${color} forfeited.`;
  game.check = null;
  game.checkmate = false;
  game.stalemate = false;
  game.lastTurnStartedAt = null;
  return { ok: true, game };
}


export function hasDeveloperMoveOverride(socketId, roomCodeRaw) {
  const roomCode = String(roomCodeRaw ?? "").trim().toUpperCase();
  const game = rooms.get(roomCode);
  if (!game) return false;
  return hasDevMoveOverride(game, socketId);
}

export function addPieceToRoom(roomCodeRaw, location, pieceTypeRaw, colorRaw = "white") {
  const roomCode = String(roomCodeRaw ?? "").trim().toUpperCase();
  const game = rooms.get(roomCode);
  if (!game) return { ok: false, reason: "Room not found." };

  const type = normalisePieceType(pieceTypeRaw);
  const color = normaliseColour(colorRaw) || game.turn || "white";
  if (!type) return { ok: false, reason: "Piece type must be pawn, knight, bishop, rook, queen, or king." };
  if (!color) return { ok: false, reason: "Colour must be white or black." };
  if (!location || !inBounds(location)) return { ok: false, reason: "Location must be inside the board." };
  if (game.variant === "normal" && location.y !== 0) return { ok: false, reason: "Normal Chess pieces must be on y=0." };
  if (getPieceAt(game, location)) return { ok: false, reason: "Location is already occupied." };

  const id = `dev_${color}_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  game.pieces.push({
    id,
    type,
    color,
    x: location.x,
    y: location.y,
    z: location.z,
    hasMoved: type === "pawn" ? false : true
  });
  game.message = `Developer added ${color} ${type} at (${location.x},${location.y},${location.z}).`;
  return { ok: true, game, lines: [`Added ${color} ${type} at (${location.x},${location.y},${location.z}).`] };
}

export function removePieceFromRoom(roomCodeRaw, location) {
  const roomCode = String(roomCodeRaw ?? "").trim().toUpperCase();
  const game = rooms.get(roomCode);
  if (!game) return { ok: false, reason: "Room not found." };
  if (!location || !inBounds(location)) return { ok: false, reason: "Location must be inside the board." };

  const removed = removePieceAt(game, location);
  if (!removed) return { ok: false, reason: "No piece found at that location." };
  game.message = `Developer removed ${removed.color} ${removed.type} from (${location.x},${location.y},${location.z}).`;
  return { ok: true, game, lines: [`Removed ${removed.color} ${removed.type} from (${location.x},${location.y},${location.z}).`] };
}


export function replacePlayerWithBotInRoom(roomCodeRaw, targetNameRaw, difficultyRaw = "medium") {
  const roomCode = String(roomCodeRaw ?? "").trim().toUpperCase();
  const game = rooms.get(roomCode);
  if (!game) return { ok: false, reason: "Room not found." };
  if (game.status === "playing") tickGameClock(game);

  const target = findParticipantInGame(game, targetNameRaw, null);
  if (!target) return { ok: false, reason: "Player not found in this room." };
  if (target.role !== "player" || !["white", "black"].includes(target.color)) {
    return { ok: false, reason: "replacewithbot can only replace an active white/black player." };
  }

  const color = target.color;
  const difficulty = normaliseAIDifficultyForRoom(difficultyRaw);
  const wasAI = isAIId(target.id);

  if (!wasAI) {
    ensureSpectator(game, { id: target.id, name: target.name || capitalise(color) });
  }

  ensureAIConfig(game);
  if (!game.ai.colors.includes(color)) game.ai.colors.push(color);
  game.ai.difficulty = difficulty;
  game.ai.difficulties[color] = difficulty;
  game.players[color] = {
    id: `AI:${roomCode}:${color}:${Date.now()}`,
    name: `AI ${capitalise(difficulty)} ${capitalise(color)}`
  };

  if (game.players.white && game.players.black && (game.status === "waiting" || game.status === "abandoned")) {
    game.status = "playing";
    game.lastTurnStartedAt = Date.now();
    ensureInitialPositionRecorded(game);
  }

  game.message = `${target.name || capitalise(color)} was replaced with ${game.players[color].name}.`;
  return { ok: true, game, color, lines: [game.message] };
}

export function replacePlayerWithRequesterInRoom(roomCodeRaw, targetNameRaw, requesterSocketId, requesterNameRaw = "Developer") {
  const roomCode = String(roomCodeRaw ?? "").trim().toUpperCase();
  const game = rooms.get(roomCode);
  if (!game) return { ok: false, reason: "Room not found." };
  if (game.status === "playing") tickGameClock(game);

  const target = findParticipantInGame(game, targetNameRaw, null);
  if (!target) return { ok: false, reason: "Target player not found in this room." };
  if (target.role !== "player" || !["white", "black"].includes(target.color)) {
    return { ok: false, reason: "replaceplayer can only replace an active white/black player." };
  }
  if (!requesterSocketId) return { ok: false, reason: "Requester socket missing." };

  const targetColor = target.color;
  const requester = findParticipantInGame(game, "self", requesterSocketId);
  const requesterRecord = {
    id: requesterSocketId,
    name: cleanName(requester?.name || requesterNameRaw) || "Developer"
  };

  if (requester?.role === "player" && requester.color === targetColor) {
    return { ok: true, game, color: targetColor, lines: [`${requesterRecord.name} already controls ${targetColor}.`] };
  }

  // Remove requester from their old role before placing them into the target colour.
  if (requester?.role === "player" && ["white", "black"].includes(requester.color)) {
    game.players[requester.color] = null;
    removeAIColour(game, requester.color);
  } else {
    game.spectators = (game.spectators || []).filter((spectator) => spectator.id !== requesterSocketId);
  }

  if (!isAIId(target.id)) {
    ensureSpectator(game, { id: target.id, name: target.name || capitalise(targetColor) });
  }

  removeAIColour(game, targetColor);
  game.players[targetColor] = requesterRecord;

  if (!game.players.white || !game.players.black) {
    game.status = game.status === "playing" ? "waiting" : game.status;
    game.lastTurnStartedAt = null;
  } else if (game.status === "waiting" || game.status === "abandoned") {
    game.status = "playing";
    game.lastTurnStartedAt = Date.now();
    ensureInitialPositionRecorded(game);
  } else if (game.status === "playing") {
    game.lastTurnStartedAt = Date.now();
  }

  game.message = `${requesterRecord.name} replaced ${target.name || targetColor} as ${targetColor}.`;
  return { ok: true, game, color: targetColor, lines: [game.message] };
}

export function endMatchByDev(roomCodeRaw, winnerRaw = "none") {
  const roomCode = String(roomCodeRaw ?? "").trim().toUpperCase();
  const game = rooms.get(roomCode);
  if (!game) return { ok: false, reason: "Room not found." };
  if (game.status === "playing") tickGameClock(game);

  const winner = normaliseWinner(winnerRaw);
  if (winnerRaw && !winner && !isNoWinnerToken(winnerRaw)) return { ok: false, reason: "Winner must be white, black, none, draw, or nowinner." };

  game.status = "finished";
  markRoomClosed(game);
  game.winner = winner;
  game.check = null;
  game.checkmate = false;
  game.stalemate = winner ? false : true;
  game.timeout = false;
  game.forfeit = false;
  game.lastTurnStartedAt = null;
  game.message = winner ? `${winner} wins by developer command.` : "Match ended by developer command with no winner.";
  return { ok: true, game, lines: [game.message] };
}

export function findPlayersByName(nameRaw) {
  const needle = String(nameRaw ?? "").trim().toLowerCase();
  if (!needle) return [];
  const matches = [];
  for (const game of rooms.values()) {
    for (const color of ["white", "black"]) {
      const player = game.players[color];
      if (player?.name?.toLowerCase().includes(needle)) {
        matches.push({ roomCode: game.roomCode, name: player.name, role: "player", color, status: game.status, variantName: game.variantName });
      }
    }
    for (const spectator of game.spectators || []) {
      if (spectator?.name?.toLowerCase().includes(needle)) {
        matches.push({ roomCode: game.roomCode, name: spectator.name, role: "spectator", color: "spectator", status: game.status, variantName: game.variantName });
      }
    }
  }
  return matches;
}

export function getPlayerCountSnapshot() {
  const uniqueHumans = new Set();
  let humanPlayers = 0;
  let spectators = 0;
  let bots = 0;

  for (const game of rooms.values()) {
    for (const color of ["white", "black"]) {
      const player = game.players[color];
      if (!player) continue;
      if (String(player.id || "").startsWith("AI:")) {
        bots += 1;
      } else {
        humanPlayers += 1;
        uniqueHumans.add(player.id);
      }
    }
    for (const spectator of game.spectators || []) {
      spectators += 1;
      if (spectator.id) uniqueHumans.add(spectator.id);
    }
  }

  return {
    rooms: rooms.size,
    activeRooms: Array.from(rooms.values()).filter((game) => game.status === "playing").length,
    humanPlayers,
    spectators,
    bots,
    uniqueHumans: uniqueHumans.size
  };
}

export function setSpectatorOverride(roomCodeRaw, targetRaw, requesterSocketId, enabled = true) {
  const roomCode = String(roomCodeRaw ?? "").trim().toUpperCase();
  const game = rooms.get(roomCode);
  if (!game) return { ok: false, reason: "Room not found." };

  const target = findParticipantInGame(game, targetRaw || "self", requesterSocketId);
  if (!target) return { ok: false, reason: "Player/spectator not found in this room." };

  if (!game.devOverrides || typeof game.devOverrides !== "object") game.devOverrides = { moveAllPieceSocketIds: [] };
  if (!Array.isArray(game.devOverrides.moveAllPieceSocketIds)) game.devOverrides.moveAllPieceSocketIds = [];

  if (enabled) {
    if (!game.devOverrides.moveAllPieceSocketIds.includes(target.id)) game.devOverrides.moveAllPieceSocketIds.push(target.id);
  } else {
    game.devOverrides.moveAllPieceSocketIds = game.devOverrides.moveAllPieceSocketIds.filter((id) => id !== target.id);
  }

  const state = enabled ? "enabled" : "disabled";
  game.message = `Developer override ${state} for ${target.name}.`;
  return { ok: true, game, lines: [`Spectator override ${state} for ${target.name}.`] };
}

export function setTimerForRoom(roomCodeRaw, timeRaw, playerRaw = null) {
  const roomCode = String(roomCodeRaw ?? "").trim().toUpperCase();
  const game = rooms.get(roomCode);
  if (!game) return { ok: false, reason: "Room not found." };
  if (game.status === "playing") tickGameClock(game);

  const color = normaliseColour(playerRaw) || game.turn || "white";
  const milliseconds = parseClockTime(timeRaw);
  if (!color) return { ok: false, reason: "Player must be white or black." };
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return { ok: false, reason: "Time must be seconds, mm:ss, or hh:mm:ss." };

  game.clocks[color] = milliseconds;
  if (game.status === "playing" && game.turn === color) game.lastTurnStartedAt = Date.now();
  if (milliseconds <= 0 && game.status === "playing") {
    game.status = "finished";
  markRoomClosed(game);
    game.timeout = true;
    game.winner = opponent(color);
    game.message = `${game.winner} wins on time.`;
    game.lastTurnStartedAt = null;
  } else {
    game.message = `Developer set ${color} timer to ${formatClock(milliseconds)}.`;
  }
  return { ok: true, game, lines: [`${color} timer = ${formatClock(milliseconds)}.`] };
}

export function setPlayerColourInRoom(roomCodeRaw, targetNameRaw, colorRaw) {
  const roomCode = String(roomCodeRaw ?? "").trim().toUpperCase();
  const game = rooms.get(roomCode);
  if (!game) return { ok: false, reason: "Room not found." };

  const target = findParticipantInGame(game, targetNameRaw, null);
  const targetColor = normalisePlayerSlot(colorRaw);
  if (!target) return { ok: false, reason: "Player/spectator not found in this room." };
  if (!targetColor) return { ok: false, reason: "Colour must be white, black, or spectator." };

  const movingRecord = { id: target.id, name: target.name };

  if (target.role === "spectator") {
    game.spectators = (game.spectators || []).filter((spectator) => spectator.id !== target.id);
  } else {
    game.players[target.color] = null;
  }

  if (targetColor === "spectator") {
    game.spectators.push(movingRecord);
    game.message = `${target.name} moved to spectator.`;
    return { ok: true, game, lines: [`${target.name} is now a spectator.`] };
  }

  const previousHolder = game.players[targetColor];
  if (previousHolder) {
    if (target.role === "player") {
      game.players[target.color] = previousHolder;
    } else {
      game.spectators.push(previousHolder);
    }
  }

  game.players[targetColor] = movingRecord;
  if (!game.players.white || !game.players.black) {
    game.status = game.status === "playing" ? "waiting" : game.status;
    game.lastTurnStartedAt = null;
  } else if (game.status === "waiting") {
    game.status = "playing";
    game.lastTurnStartedAt = Date.now();
    ensureInitialPositionRecorded(game);
  }

  game.message = `${target.name} is now ${targetColor}.`;
  return { ok: true, game, lines: [`${target.name} is now ${targetColor}.`] };
}

export function listPiecesInRoom(roomCodeRaw, colorRaw = null) {
  const roomCode = String(roomCodeRaw ?? "").trim().toUpperCase();
  const game = rooms.get(roomCode);
  if (!game) return { ok: false, reason: "Room not found." };
  const color = normaliseColour(colorRaw);
  const pieces = (game.pieces || [])
    .filter((piece) => !color || piece.color === color)
    .sort((a, b) => `${a.color}-${a.type}-${a.x}-${a.y}-${a.z}`.localeCompare(`${b.color}-${b.type}-${b.x}-${b.y}-${b.z}`));
  return {
    ok: true,
    game,
    lines: pieces.map((piece) => `${piece.id} | ${piece.color} ${piece.type} @ (${piece.x},${piece.y},${piece.z})`)
  };
}

export function setTurnInRoom(roomCodeRaw, colorRaw) {
  const roomCode = String(roomCodeRaw ?? "").trim().toUpperCase();
  const game = rooms.get(roomCode);
  if (!game) return { ok: false, reason: "Room not found." };
  const color = normaliseColour(colorRaw);
  if (!color) return { ok: false, reason: "Turn must be white or black." };
  if (game.status === "playing") tickGameClock(game);
  game.turn = color;
  if (game.status === "playing") game.lastTurnStartedAt = Date.now();
  game.message = `${color} to move.`;
  return { ok: true, game, lines: [`Turn set to ${color}.`] };
}

export function appendChatMessage(socketId, roomCodeRaw, bodyRaw) {
  const roomCode = String(roomCodeRaw ?? "").trim().toUpperCase();
  const game = rooms.get(roomCode);
  if (!game) return { ok: false, reason: "Room not found." };

  const participant = getParticipant(game, socketId);
  if (!participant) return { ok: false, reason: "You are not in this room." };

  const body = String(bodyRaw ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
  if (!body) return { ok: false, reason: "Message is empty." };

  if (!Array.isArray(game.chat)) game.chat = [];
  game.chat.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    time: Date.now(),
    color: participant.color,
    role: participant.role,
    name: participant.name,
    body
  });
  game.chat = game.chat.slice(-120);
  return { ok: true, game };
}

export function tickGameClock(game) {
  if (!game || game.status !== "playing" || game.timerPaused || !game.lastTurnStartedAt) return false;
  const now = Date.now();
  const elapsed = Math.max(0, now - game.lastTurnStartedAt);
  if (elapsed <= 0) return false;

  game.clocks[game.turn] = Math.max(0, game.clocks[game.turn] - elapsed);
  game.lastTurnStartedAt = now;

  if (game.clocks[game.turn] <= 0) {
    game.status = "finished";
  markRoomClosed(game);
    game.timeout = true;
    game.winner = opponent(game.turn);
    game.message = `${game.winner} wins on time.`;
    game.check = null;
    game.checkmate = false;
    game.stalemate = false;
    game.lastTurnStartedAt = null;
  }

  return true;
}

export function tickAllRoomClocks() {
  const affected = [];
  for (const game of rooms.values()) {
    const beforeStatus = game.status;
    const beforeWhite = game.clocks?.white;
    const beforeBlack = game.clocks?.black;
    tickGameClock(game);
    if (game.status !== beforeStatus || game.clocks?.white !== beforeWhite || game.clocks?.black !== beforeBlack) affected.push(game);
  }
  return affected;
}



function ensureAIConfig(game) {
  if (!game.ai || typeof game.ai !== "object") game.ai = {};
  game.ai.enabled = true;
  if (!Array.isArray(game.ai.colors)) game.ai.colors = [];
  if (!game.ai.difficulty) game.ai.difficulty = "medium";
  if (!game.ai.difficulties || typeof game.ai.difficulties !== "object") game.ai.difficulties = {};
  game.gameMode = game.gameMode === "online" ? "ai" : game.gameMode;
}

function removeAIColour(game, color) {
  if (!game?.ai) return;
  if (Array.isArray(game.ai.colors)) game.ai.colors = game.ai.colors.filter((entry) => entry !== color);
  if (game.ai.color === color) game.ai.color = game.ai.colors?.[0] || null;
  if (game.ai.difficulties && typeof game.ai.difficulties === "object") delete game.ai.difficulties[color];
  const hasAI = Array.isArray(game.ai.colors) && game.ai.colors.length > 0;
  if (!hasAI) {
    game.ai.enabled = false;
    if (game.gameMode === "ai") game.gameMode = "online";
  }
}

function ensureSpectator(game, participant) {
  if (!participant?.id) return;
  if (isAIId(participant.id)) return;
  game.spectators = (game.spectators || []).filter((spectator) => spectator.id !== participant.id);
  game.spectators.push({ id: participant.id, name: cleanName(participant.name) || "Spectator" });
}

function isAIId(id) {
  return String(id || "").startsWith("AI:");
}

function normaliseAIDifficultyForRoom(value) {
  const text = String(value || "").trim().toLowerCase();
  return ["easy", "medium", "hard"].includes(text) ? text : "medium";
}

function hasDevMoveOverride(game, socketId) {
  return Boolean(socketId && game?.devOverrides?.moveAllPieceSocketIds?.includes(socketId));
}

function normalisePieceType(value) {
  const text = String(value || "").trim().toLowerCase();
  const aliases = { n: "knight", b: "bishop", r: "rook", q: "queen", k: "king", p: "pawn" };
  const type = aliases[text] || text;
  return ["pawn", "knight", "bishop", "rook", "queen", "king"].includes(type) ? type : null;
}

function normaliseColour(value) {
  const text = String(value || "").trim().toLowerCase();
  if (["white", "w"].includes(text)) return "white";
  if (["black", "b"].includes(text)) return "black";
  return null;
}

function normalisePlayerSlot(value) {
  const text = String(value || "").trim().toLowerCase();
  if (["white", "w"].includes(text)) return "white";
  if (["black", "b"].includes(text)) return "black";
  if (["spectator", "spec", "watcher"].includes(text)) return "spectator";
  return null;
}

function normaliseWinner(value) {
  const text = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (["white", "w"].includes(text)) return "white";
  if (["black", "b"].includes(text)) return "black";
  return null;
}

function isNoWinnerToken(value) {
  const text = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  return !text || ["none", "nowinner", "draw", "tie", "null"].includes(text);
}

function findParticipantInGame(game, nameRaw, requesterSocketId = null) {
  const text = String(nameRaw ?? "").trim().toLowerCase();
  if ((!text || text === "self" || text === "me") && requesterSocketId) {
    if (game.players.white?.id === requesterSocketId) return { role: "player", color: "white", ...game.players.white };
    if (game.players.black?.id === requesterSocketId) return { role: "player", color: "black", ...game.players.black };
    const spectator = (game.spectators || []).find((item) => item.id === requesterSocketId);
    if (spectator) return { role: "spectator", color: "spectator", ...spectator };
  }

  if (["white", "black"].includes(text) && game.players[text]) {
    return { role: "player", color: text, ...game.players[text] };
  }

  for (const color of ["white", "black"]) {
    const player = game.players[color];
    if (player?.name?.toLowerCase() === text || player?.name?.toLowerCase().includes(text)) {
      return { role: "player", color, ...player };
    }
  }

  const spectator = (game.spectators || []).find((item) => item.name?.toLowerCase() === text || item.name?.toLowerCase().includes(text));
  if (spectator) return { role: "spectator", color: "spectator", ...spectator };
  return null;
}

function parseClockTime(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return NaN;
  if (/^\d+(\.\d+)?$/.test(raw)) return Math.round(Number(raw) * 1000);
  const parts = raw.split(":").map((part) => Number.parseInt(part, 10));
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return NaN;
  if (parts.length === 2) return ((parts[0] * 60) + parts[1]) * 1000;
  if (parts.length === 3) return ((parts[0] * 3600) + (parts[1] * 60) + parts[2]) * 1000;
  return NaN;
}

function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getParticipant(game, socketId) {
  if (game.players.white?.id === socketId) return { role: "player", color: "white", name: game.players.white.name || "White" };
  if (game.players.black?.id === socketId) return { role: "player", color: "black", name: game.players.black.name || "Black" };
  const spectator = game.spectators?.find((candidate) => candidate.id === socketId);
  if (spectator) return { role: "spectator", color: "spectator", name: spectator.name || "Spectator" };
  return null;
}

function capitalise(value) {
  return String(value || "").slice(0, 1).toUpperCase() + String(value || "").slice(1);
}

function ensureInitialPositionRecorded(game) {
  if (!game || game.status !== "playing") return;
  if (Array.isArray(game.positionHistory) && game.positionHistory.length > 0) return;
  recordCurrentPosition(game);
}

function cleanName(name) {
  return String(name ?? "").trim().slice(0, 24);
}


export function createRoomShout(roomCodeRaw, message, from = "Developer") {
  const roomCode = String(roomCodeRaw ?? "").trim().toUpperCase();
  const game = rooms.get(roomCode);
  if (!game) return { ok: false, reason: "Room not found." };
  const body = String(message ?? "").trim().slice(0, 160);
  if (!body) return { ok: false, reason: "Usage: shout [message]" };
  return {
    ok: true,
    roomCode: game.roomCode,
    message: body,
    from: cleanName(from) || "Developer",
    lines: [`Shout sent: ${body}`]
  };
}

export function runDevUtilityCommand(roomCodeRaw, action, args = [], requesterSocketId = null, requesterName = "Developer") {
  const roomCode = String(roomCodeRaw ?? "").trim().toUpperCase();
  const game = roomCode ? rooms.get(roomCode) : null;
  const needsRoom = !["listRoomsDetailed", "playerCount"].includes(action);
  if (needsRoom && !game) return { ok: false, reason: "No current room. Use joincode/spectatematch/startmatch first." };

  if (action === "teleportPiece") {
    const fromParsed = consumeDevLocationArgs(args, 0);
    if (!fromParsed) return { ok: false, reason: "Usage: teleportpiece [from] [to]" };
    const toParsed = consumeDevLocationArgs(args, fromParsed.nextIndex);
    if (!toParsed) return { ok: false, reason: "Usage: teleportpiece [from] [to]" };
    const piece = getPieceAt(game, fromParsed.location);
    if (!piece) return { ok: false, reason: "No piece at source location." };
    if (!inBounds(toParsed.location)) return { ok: false, reason: "Target outside board." };
    removePieceAt(game, toParsed.location);
    Object.assign(piece, toParsed.location, { hasMoved: true });
    game.message = `Developer teleported ${piece.color} ${piece.type}.`;
    return { ok: true, game, lines: [`Teleported ${piece.color} ${piece.type} to ${fmtLoc(toParsed.location)}.`] };
  }

  if (action === "moveForce") {
    const fromParsed = consumeDevLocationArgs(args, 0);
    if (!fromParsed) return { ok: false, reason: "Usage: moveforce [from] [to]" };
    const toParsed = consumeDevLocationArgs(args, fromParsed.nextIndex);
    if (!toParsed) return { ok: false, reason: "Usage: moveforce [from] [to]" };
    const piece = getPieceAt(game, fromParsed.location);
    if (!piece) return { ok: false, reason: "No piece at source location." };
    if (!inBounds(toParsed.location)) return { ok: false, reason: "Target outside board." };
    const captured = removePieceAt(game, toParsed.location);
    const from = { x: piece.x, y: piece.y, z: piece.z };
    Object.assign(piece, toParsed.location, { hasMoved: true });
    game.moveHistory.push({ pieceId: piece.id, pieceColor: piece.color, pieceType: piece.type, from, to: { ...toParsed.location }, captured: captured ? { id: captured.id, type: captured.type, color: captured.color } : null, force: true, time: Date.now() });
    game.lastMove = game.moveHistory[game.moveHistory.length - 1];
    game.turn = opponent(piece.color);
    Object.assign(game, getGameEndState(game, game.turn));
    game.lastTurnStartedAt = game.status === "playing" ? Date.now() : null;
    return { ok: true, game, lines: [`Force-moved ${piece.color} ${piece.type} ${fmtLoc(from)} → ${fmtLoc(toParsed.location)}.`] };
  }

  if (action === "legalMovesAt") {
    const parsed = consumeDevLocationArgs(args, 0);
    if (!parsed) return { ok: false, reason: "Usage: legalmoves [location]" };
    const piece = getPieceAt(game, parsed.location);
    if (!piece) return { ok: false, reason: "No piece at that location." };
    const moves = getLegalMoves(game, piece);
    return { ok: true, game, lines: [`${piece.color} ${piece.type} @ ${fmtLoc(piece)} has ${moves.length} legal moves:`, ...moves.map(fmtLoc).slice(0, 80)] };
  }

  if (action === "checkStatus") {
    const lines = ["Check status:"];
    for (const color of ["white", "black"]) {
      const inCheck = isKingInCheck(game, color);
      const legalCount = game.pieces.filter((p) => p.color === color).reduce((n, p) => n + getLegalMoves(game, p).length, 0);
      lines.push(`${color}: ${inCheck ? "in check" : "not in check"}, legal moves=${legalCount}`);
    }
    lines.push(`status=${game.status}, winner=${game.winner || "none"}`);
    return { ok: true, game, lines };
  }

  if (action === "validateBoard") {
    const issues = [];
    for (const color of ["white", "black"]) {
      const kings = game.pieces.filter((p) => p.color === color && p.type === "king");
      if (kings.length !== 1) issues.push(`${color} has ${kings.length} kings.`);
    }
    const ids = new Set();
    const locs = new Map();
    for (const piece of game.pieces) {
      if (ids.has(piece.id)) issues.push(`duplicate piece id ${piece.id}`); else ids.add(piece.id);
      if (!inBounds(piece)) issues.push(`${piece.id} is out of bounds.`);
      const k = `${piece.x},${piece.y},${piece.z}`;
      if (locs.has(k)) issues.push(`overlap at ${k}: ${locs.get(k)} and ${piece.id}`); else locs.set(k, piece.id);
      if (game.variant === "normal" && piece.y !== 0) issues.push(`${piece.id} has y=${piece.y} in Normal Chess.`);
    }
    return { ok: true, game, lines: issues.length ? issues : ["Board valid."] };
  }

  if (action === "resetMatch") {
    const reset = createGame(game.roomCode, { variant: game.variant, timeControl: game.timeControl, gameMode: game.gameMode, aiDifficulty: game.ai?.difficulty });
    reset.players = game.players;
    reset.spectators = game.spectators || [];
    reset.ai = game.ai;
    reset.status = game.players.white && game.players.black ? "playing" : "waiting";
    reset.message = reset.status === "playing" ? "white to move." : "Waiting for opponent.";
    reset.lastTurnStartedAt = reset.status === "playing" ? Date.now() : null;
    rooms.set(game.roomCode, Object.assign(game, reset));
    if (game.status === "playing") ensureInitialPositionRecorded(game);
    return { ok: true, game, lines: ["Match reset to starting position."] };
  }

  if (action === "clonePosition") {
    const code = Buffer.from(JSON.stringify({ variant: game.variant, turn: game.turn, pieces: game.pieces, clocks: game.clocks, halfmoveClock: game.halfmoveClock })).toString("base64url");
    return { ok: true, game, lines: ["Position code:", code] };
  }

  if (action === "loadPosition") {
    try {
      const decoded = JSON.parse(Buffer.from(String(args[0] || ""), "base64url").toString("utf8"));
      if (!Array.isArray(decoded.pieces)) throw new Error("No pieces array.");
      game.pieces = decoded.pieces.map((p, i) => ({ id: p.id || `loaded_${i}`, type: p.type, color: p.color, x: p.x, y: p.y || 0, z: p.z, hasMoved: Boolean(p.hasMoved) }));
      game.turn = decoded.turn === "black" ? "black" : "white";
      if (decoded.clocks) game.clocks = decoded.clocks;
      game.halfmoveClock = Number(decoded.halfmoveClock) || 0;
      game.moveHistory = [];
      game.positionHistory = [];
      game.positionCounts = {};
      game.status = "playing";
      game.lastTurnStartedAt = Date.now();
      game.message = "Developer loaded position.";
      return { ok: true, game, lines: ["Position loaded."] };
    } catch (error) {
      return { ok: false, reason: `Could not load position: ${error.message}` };
    }
  }

  if (action === "setAIDifficulty") {
    const color = normaliseColour(args[0]) || game.turn;
    const difficulty = normaliseAIDifficultyForRoom(args[1] || args[0]);
    ensureAIConfig(game);
    if (!game.ai.difficulties) game.ai.difficulties = {};
    game.ai.difficulties[color] = difficulty;
    if (!game.ai.colors.includes(color)) game.ai.colors.push(color);
    if (!game.players[color] || !isAIId(game.players[color].id)) game.players[color] = { id: `AI:${game.roomCode}:${color}:${Date.now()}`, name: `AI ${capitalise(difficulty)} ${capitalise(color)}` };
    game.message = `${capitalise(color)} AI difficulty set to ${difficulty}.`;
    return { ok: true, game, lines: [game.message] };
  }

  if (action === "pauseBots") { ensureAIConfig(game); game.ai.paused = true; return { ok: true, game, lines: ["Bots paused."] }; }
  if (action === "resumeBots") { ensureAIConfig(game); game.ai.paused = false; return { ok: true, game, lines: ["Bots resumed."] }; }

  if (action === "kickPlayer") {
    const target = findParticipantInGame(game, args.join(" "), requesterSocketId);
    if (!target) return { ok: false, reason: "Player not found." };
    if (target.role === "player") game.players[target.color] = null;
    else game.spectators = (game.spectators || []).filter((s) => s.id !== target.id);
    game.message = `${target.name} was kicked by developer.`;
    return { ok: true, game, lines: [game.message] };
  }

  if (action === "lockRoom") { game.locked = true; return { ok: true, game, lines: ["Room locked to new spectators."] }; }
  if (action === "unlockRoom") { game.locked = false; return { ok: true, game, lines: ["Room unlocked."] }; }
  if (action === "renameRoom") { game.displayName = args.join(" ").trim().slice(0, 48) || null; return { ok: true, game, lines: [`Room display name: ${game.displayName || "<none>"}`] }; }
  if (action === "broadcast" || action === "systemChat") {
    const body = args.join(" ").trim().slice(0, 240) || "System message.";
    if (!Array.isArray(game.chat)) game.chat = [];
    game.chat.push({ id: `system-${Date.now()}`, time: Date.now(), color: "system", role: "system", name: "System", body });
    return { ok: true, game, lines: [`System chat: ${body}`] };
  }

  if (action === "pauseTimer") { game.timerPaused = true; game.lastTurnStartedAt = null; return { ok: true, game, lines: ["Timer paused."] }; }
  if (action === "resumeTimer") { game.timerPaused = false; if (game.status === "playing") game.lastTurnStartedAt = Date.now(); return { ok: true, game, lines: ["Timer resumed."] }; }
  if (action === "addTime") {
    const color = normaliseColour(args[0]) || game.turn;
    const amount = parseClockTime(args[1] || args[0]);
    if (!Number.isFinite(amount)) return { ok: false, reason: "Usage: addtime [white|black] [seconds|mm:ss]" };
    game.clocks[color] = Math.max(0, Number(game.clocks[color] || 0) + amount);
    return { ok: true, game, lines: [`Added ${formatClock(amount)} to ${color}.`] };
  }
  if (action === "setTimeControl") {
    const tc = String(args[0] || "").trim().toLowerCase();
    if (!TIME_CONTROLS[tc]) return { ok: false, reason: "Usage: settimecontrol [classical|rapid|blitz|bullet]" };
    const ms = TIME_CONTROLS[tc].seconds * 1000;
    game.timeControl = tc; game.timeControlName = TIME_CONTROLS[tc].label; game.clockInitialMs = ms; game.clocks = { white: ms, black: ms }; game.lastTurnStartedAt = game.status === "playing" ? Date.now() : null;
    return { ok: true, game, lines: [`Time control set to ${TIME_CONTROLS[tc].label}.`] };
  }
  if (action === "flagPlayer") {
    const color = normaliseColour(args[0]) || game.turn;
    game.clocks[color] = 0; game.status = "finished"; game.timeout = true; game.winner = opponent(color); game.lastTurnStartedAt = null; game.message = `${game.winner} wins on time.`;
    return { ok: true, game, lines: [game.message] };
  }

  if (action === "chaosMove") {
    const candidates = [];
    for (const piece of game.pieces.filter((p) => p.color === game.turn)) for (const move of getLegalMoves(game, piece)) candidates.push({ piece, move });
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    if (!chosen) return { ok: false, reason: "No legal chaos move." };
    return runDevUtilityCommand(roomCode, "moveForce", [`${chosen.piece.x},${chosen.piece.y},${chosen.piece.z}`, `${chosen.move.x},${chosen.move.y},${chosen.move.z}`], requesterSocketId, requesterName);
  }

  if (action === "swapKings") {
    const wk = game.pieces.find((p) => p.color === "white" && p.type === "king");
    const bk = game.pieces.find((p) => p.color === "black" && p.type === "king");
    if (!wk || !bk) return { ok: false, reason: "Both kings are required." };
    const w = { x: wk.x, y: wk.y, z: wk.z }; Object.assign(wk, { x: bk.x, y: bk.y, z: bk.z }); Object.assign(bk, w);
    return { ok: true, game, lines: ["Kings swapped."] };
  }

  if (action === "promoteAll") {
    const color = normaliseColour(args[0]);
    const type = normalisePieceType(args[1] || args[0]) || "queen";
    let count = 0;
    for (const p of game.pieces) if (p.type === "pawn" && (!color || p.color === color)) { p.type = type; count++; }
    return { ok: true, game, lines: [`Promoted ${count} pawn(s) to ${type}.`] };
  }
  if (action === "army") {
    const color = normaliseColour(args[0]);
    const type = normalisePieceType(args[1]);
    if (!color || !type || type === "king") return { ok: false, reason: "Usage: army [white|black] [pawn|knight|bishop|rook|queen]" };
    let count = 0; for (const p of game.pieces) if (p.color === color && p.type !== "king") { p.type = type; count++; }
    return { ok: true, game, lines: [`Converted ${count} ${color} pieces to ${type}.`] };
  }
  if (action === "mirrorBoard") {
    for (const p of game.pieces) { p.x = 7 - p.x; p.z = 7 - p.z; if (game.variant === "threeD") p.y = 7 - p.y; }
    return { ok: true, game, lines: ["Board mirrored."] };
  }
  if (action === "scramble") {
    const occupied = new Set();
    for (const piece of game.pieces) {
      let placed = false;
      for (let tries = 0; tries < 1000 && !placed; tries += 1) {
        const loc = {
          x: Math.floor(Math.random() * 8),
          y: game.variant === "threeD" ? Math.floor(Math.random() * 8) : 0,
          z: Math.floor(Math.random() * 8)
        };
        const key = `${loc.x},${loc.y},${loc.z}`;
        if (occupied.has(key)) continue;
        Object.assign(piece, loc, { hasMoved: true });
        occupied.add(key);
        placed = true;
      }
    }
    game.lastMove = null;
    game.halfmoveClock = 0;
    if (Array.isArray(game.positionHistory)) game.positionHistory = [];
    if (game.positionCounts) game.positionCounts = {};
    return { ok: true, game, lines: [`Scrambled ${game.pieces.length} piece(s).`] };
  }
  if (action === "shuffleBackRank") {
    const pieces = ["rook", "knight", "bishop", "queen", "bishop", "knight", "rook"];
    for (const color of ["white", "black"]) {
      const z = color === "white" ? 0 : 7;
      const back = game.pieces.filter((p) => p.color === color && p.z === z && p.y === 0 && p.type !== "king");
      const shuffled = pieces.sort(() => Math.random() - 0.5);
      back.forEach((p, i) => { p.type = shuffled[i % shuffled.length]; });
    }
    return { ok: true, game, lines: ["Back ranks shuffled."] };
  }
  if (action === "spawnArmy") {
    const color = normaliseColour(args[0]); const type = normalisePieceType(args[1]); const count = Math.min(32, Math.max(1, Number.parseInt(args[2],10)||1));
    if (!color || !type) return { ok: false, reason: "Usage: spawnarmy [white|black] [piece] [count]" };
    let spawned = 0;
    for (let tries=0; tries<800 && spawned<count; tries++) {
      const loc={x:Math.floor(Math.random()*8), y: game.variant === "threeD" ? Math.floor(Math.random()*8) : 0, z:Math.floor(Math.random()*8)};
      if (getPieceAt(game, loc)) continue;
      game.pieces.push({id:`dev_${color}_${type}_${Date.now()}_${spawned}`, type, color, ...loc, hasMoved:true}); spawned++;
    }
    return { ok: true, game, lines: [`Spawned ${spawned} ${color} ${type}(s).`] };
  }
  if (action === "nuke") {
    const parsed = consumeDevLocationArgs(args,0); const radius = Math.max(0, Number.parseInt(args[parsed?.nextIndex || 1],10)||0);
    if (!parsed) return { ok: false, reason: "Usage: nuke [location] [radius]" };
    const before = game.pieces.length;
    game.pieces = game.pieces.filter((p) => Math.max(Math.abs(p.x-parsed.location.x), Math.abs(p.y-parsed.location.y), Math.abs(p.z-parsed.location.z)) > radius || p.type === "king");
    return { ok: true, game, lines: [`Nuked ${before-game.pieces.length} non-king piece(s).`] };
  }
  if (action === "kingOfTheHill") {
    const wk = game.pieces.find((p)=>p.color==="white"&&p.type==="king"); const bk = game.pieces.find((p)=>p.color==="black"&&p.type==="king");
    if (wk) Object.assign(wk,{x:3,y:0,z:3}); if (bk) Object.assign(bk,{x:4,y:game.variant==="threeD"?1:0,z:4});
    return { ok: true, game, lines: ["King of the hill setup applied."] };
  }

  return null;
}

export function getDetailedRoomLines() {
  const matches = Array.from(rooms.values());
  if (!matches.length) return ["No rooms."];
  return matches.map((g) => `${g.roomCode} | ${g.displayName || g.variantName} | ${g.status} | ${g.players.white?.name || "open"} vs ${g.players.black?.name || "open"} | spectators ${(g.spectators||[]).length} | bots ${(g.ai?.colors||[]).join(",") || "none"} | timers ${formatClock(g.clocks?.white)}-${formatClock(g.clocks?.black)}`);
}

function consumeDevLocationArgs(args, startIndex = 0) {
  if (!Array.isArray(args) || args.length <= startIndex) return null;
  const first = String(args[startIndex] || "").trim();
  const chess = /^([a-h])([1-8])$/i.exec(first);
  if (chess) return { location: { x: chess[1].toLowerCase().charCodeAt(0)-97, y: 0, z: Number(chess[2])-1 }, nextIndex: startIndex + 1 };
  const parts = first.replace(/[()\[\]{}]/g, "").split(/[,:/]/).map((v) => Number.parseInt(v.trim(), 10));
  if (parts.length === 3 && parts.every(Number.isInteger)) return { location: { x: parts[0], y: parts[1], z: parts[2] }, nextIndex: startIndex + 1 };
  if (args.length >= startIndex + 3) {
    const xyz = [args[startIndex], args[startIndex+1], args[startIndex+2]].map((v)=>Number.parseInt(v,10));
    if (xyz.every(Number.isInteger)) return { location: { x: xyz[0], y: xyz[1], z: xyz[2] }, nextIndex: startIndex + 3 };
  }
  return null;
}

function fmtLoc(pos) { return `(${pos.x},${pos.y},${pos.z})`; }
