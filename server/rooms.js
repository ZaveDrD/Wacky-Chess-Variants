import { customAlphabet } from "nanoid";
import { createGame } from "./rules/setup.js";
import { getLegalMoves } from "./rules/check.js";
import { getPieceById, opponent } from "./rules/utils.js";

const nanoid = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);
export const rooms = new Map();

export function createRoom(hostSocket, hostName, options = {}) {
  let roomCode = nanoid();
  while (rooms.has(roomCode)) roomCode = nanoid();

  const game = createGame(roomCode, options);
  game.players.white = {
    id: hostSocket.id,
    name: cleanName(hostName) || "White"
  };

  rooms.set(roomCode, game);
  hostSocket.join(roomCode);
  return game;
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
    game.message = "white to move.";
    game.lastTurnStartedAt = Date.now();
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

  const player = game.players[piece.color];
  if (!player || player.id !== socketId) return { ok: false, reason: "You do not control that piece." };
  if (piece.color !== game.turn) return { ok: false, reason: "It is not your turn." };

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
  if (!game || game.status !== "playing" || !game.lastTurnStartedAt) return false;
  const now = Date.now();
  const elapsed = Math.max(0, now - game.lastTurnStartedAt);
  if (elapsed <= 0) return false;

  game.clocks[game.turn] = Math.max(0, game.clocks[game.turn] - elapsed);
  game.lastTurnStartedAt = now;

  if (game.clocks[game.turn] <= 0) {
    game.status = "finished";
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

function getParticipant(game, socketId) {
  if (game.players.white?.id === socketId) return { role: "player", color: "white", name: game.players.white.name || "White" };
  if (game.players.black?.id === socketId) return { role: "player", color: "black", name: game.players.black.name || "Black" };
  const spectator = game.spectators?.find((candidate) => candidate.id === socketId);
  if (spectator) return { role: "spectator", color: "spectator", name: spectator.name || "Spectator" };
  return null;
}

function cleanName(name) {
  return String(name ?? "").trim().slice(0, 24);
}
