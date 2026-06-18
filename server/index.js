import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import { appendChatMessage, createDevMatch, createRoom, forfeitGame, getLegalMovesForSocket, getOpenMatches, getRoomSnapshot, joinRoom, leaveCurrentRooms, removeSocketFromRooms, rooms, spectateRoom, tickAllRoomClocks, tickGameClock } from "./rooms.js";
import { attemptLegalMove } from "./rules/check.js";
import { isAITurn, runAIMove } from "./rules/ai.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3001;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === "production" ? false : ["http://localhost:5173", "http://127.0.0.1:5173"],
    methods: ["GET", "POST"]
  }
});

const clientDist = path.join(__dirname, "../client/dist");
app.use(express.static(clientDist));

app.get("/health", (_req, res) => {
  res.json({ ok: true, rooms: rooms.size });
});

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

io.on("connection", (socket) => {
  socket.on("createRoom", ({ name, variant, timeControl, gameMode, aiDifficulty } = {}) => {
    const game = createRoom(socket, name, { variant, timeControl, gameMode, aiDifficulty });
    socket.emit("roomCreated", { roomCode: game.roomCode, color: "white", role: "player", game });
    io.to(game.roomCode).emit("gameState", game);
    scheduleAIMoveIfNeeded(game);
  });

  socket.on("joinRoom", ({ roomCode, name } = {}) => {
    const result = joinRoom(socket, roomCode, name);
    if (!result.ok) {
      socket.emit("joinError", result.reason);
      return;
    }

    socket.emit("roomJoined", { roomCode: result.game.roomCode, color: result.color, role: result.role, game: result.game });
    io.to(result.game.roomCode).emit("gameState", result.game);
    scheduleAIMoveIfNeeded(result.game);
  });

  socket.on("selectPiece", ({ roomCode, pieceId } = {}) => {
    const result = getLegalMovesForSocket(socket.id, roomCode, pieceId);
    if (!result.ok) {
      socket.emit("legalMoves", { pieceId, legalMoves: [], reason: result.reason });
      return;
    }
    if (result.game) io.to(result.game.roomCode).emit("gameState", result.game);
    socket.emit("legalMoves", { pieceId, legalMoves: result.legalMoves });
  });

  socket.on("attemptMove", ({ roomCode, pieceId, to, promotion } = {}) => {
    const game = rooms.get(String(roomCode ?? "").trim().toUpperCase());
    if (!game) {
      socket.emit("invalidMove", "Room not found.");
      return;
    }

    tickGameClock(game);
    const result = attemptLegalMove(game, socket.id, pieceId, to, { promotion });
    if (!result.ok) {
      socket.emit("invalidMove", result.reason);
      return;
    }

    io.to(game.roomCode).emit("gameState", game);
    scheduleAIMoveIfNeeded(game);
  });


  socket.on("forfeitGame", ({ roomCode } = {}) => {
    const result = forfeitGame(socket.id, roomCode);
    if (!result.ok) {
      socket.emit("invalidMove", result.reason);
      return;
    }
    io.to(result.game.roomCode).emit("gameState", result.game);
  });

  socket.on("sendChatMessage", ({ roomCode, body } = {}) => {
    const result = appendChatMessage(socket.id, roomCode, body);
    if (!result.ok) {
      socket.emit("chatError", result.reason);
      return;
    }
    io.to(result.game.roomCode).emit("gameState", result.game);
  });


  socket.on("devCommand", (payload = {}) => {
    const result = handleDevCommand(socket, payload);
    if (result?.gameStateRoom) {
      io.to(result.gameStateRoom).emit("gameState", rooms.get(result.gameStateRoom));
    }
    if (Array.isArray(result?.affectedRooms)) {
      for (const roomCode of result.affectedRooms) {
        const game = rooms.get(roomCode);
        if (game) io.to(roomCode).emit("gameState", game);
      }
    }
    socket.emit("devCommandResult", result?.response || { ok: false, lines: ["Command failed."] });
    if (result?.roomEvent === "roomCreated") socket.emit("roomCreated", result.roomPayload);
    if (result?.roomEvent === "roomJoined") socket.emit("roomJoined", result.roomPayload);
    if (result?.scheduleRoomCode) {
      const game = rooms.get(result.scheduleRoomCode);
      if (game) {
        io.to(game.roomCode).emit("gameState", game);
        scheduleAIMoveIfNeeded(game);
      }
    }
  });

  socket.on("disconnect", () => {
    const affectedGames = removeSocketFromRooms(socket.id);
    for (const game of affectedGames) {
      io.to(game.roomCode).emit("gameState", game);
    }
  });
});


function handleDevCommand(socket, payload = {}) {
  const action = String(payload.action || "").trim();
  const args = Array.isArray(payload.args) ? payload.args : [];
  const name = String(payload.name || "").trim() || "Developer";
  const currentRoomCode = String(payload.currentRoomCode || "").trim().toUpperCase();
  const selectedVariant = normaliseDevVariant(payload.selectedVariant || args[0] || "threeD");
  const selectedTimeControl = normaliseDevTimeControl(payload.selectedTimeControl || "rapid");
  const selectedDifficulty = normaliseDevDifficulty(payload.selectedAIDifficulty || "medium");

  if (action === "findOpenMatches") {
    const matches = getOpenMatches();
    if (!matches.length) return { response: { ok: true, lines: ["No open matches found."] } };
    return {
      response: {
        ok: true,
        lines: matches.map((match) => `${match.roomCode} | ${match.variantName} | ${match.status} | ${match.white || "open"} vs ${match.black || "open"} | spectators ${match.spectators} | moves ${match.moveCount}`)
      }
    };
  }

  if (action === "roomInfo") {
    const roomCode = String(args[0] || currentRoomCode || "").trim().toUpperCase();
    const snapshot = getRoomSnapshot(roomCode);
    if (!snapshot) return { response: { ok: false, lines: [`Room not found: ${roomCode || "<none>"}`] } };
    return {
      response: {
        ok: true,
        lines: [
          `${snapshot.roomCode} | ${snapshot.variantName} | ${snapshot.status}`,
          `Mode: ${snapshot.gameMode}${snapshot.hasAI ? ` | AI: ${snapshot.aiColors.join(",")}` : ""}`,
          `Players: ${snapshot.white || "open"} vs ${snapshot.black || "open"}`,
          `Turn: ${snapshot.turn} | Moves: ${snapshot.moveCount} | Spectators: ${snapshot.spectators}`,
          snapshot.message ? `Message: ${snapshot.message}` : ""
        ].filter(Boolean)
      }
    };
  }

  if (action === "spectateMatch") {
    const requested = String(args[0] || "").trim().toUpperCase();
    const matches = getOpenMatches();
    const roomCode = requested === "RANDOM" || !requested
      ? matches[Math.floor(Math.random() * matches.length)]?.roomCode
      : requested;
    if (!roomCode) return { response: { ok: false, lines: ["No open matches available to spectate."] } };
    const affected = leaveCurrentRooms(socket, socket.id);
    const result = spectateRoom(socket, roomCode, name);
    if (!result.ok) return { response: { ok: false, lines: [result.reason] } };
    return {
      response: { ok: true, lines: [`Spectating ${result.game.roomCode}.`] },
      roomEvent: "roomJoined",
      roomPayload: { roomCode: result.game.roomCode, color: result.color, role: result.role, game: result.game },
      gameStateRoom: result.game.roomCode,
      affectedRooms: affected.map((game) => game.roomCode),
      scheduleRoomCode: result.game.roomCode
    };
  }

  if (action === "joinCode") {
    const roomCode = String(args[0] || "").trim().toUpperCase();
    if (!roomCode) return { response: { ok: false, lines: ["Usage: joincode [room code]"] } };
    const affected = leaveCurrentRooms(socket, socket.id);
    const result = joinRoom(socket, roomCode, name);
    if (!result.ok) return { response: { ok: false, lines: [result.reason] } };
    return {
      response: { ok: true, lines: [`Joined ${result.game.roomCode} as ${result.role === "spectator" ? "spectator" : result.color}.`] },
      roomEvent: "roomJoined",
      roomPayload: { roomCode: result.game.roomCode, color: result.color, role: result.role, game: result.game },
      gameStateRoom: result.game.roomCode,
      affectedRooms: affected.map((game) => game.roomCode),
      scheduleRoomCode: result.game.roomCode
    };
  }

  if (action === "startMatch") {
    const variant = normaliseDevVariant(args[0] || selectedVariant);
    const botCount = Math.min(2, Math.max(0, Number.parseInt(args[1], 10) || 0));
    const difficulty = normaliseDevDifficulty(args[2] || selectedDifficulty);
    const affected = leaveCurrentRooms(socket, socket.id);
    const result = createDevMatch(socket, name, {
      variant,
      timeControl: selectedTimeControl,
      botCount,
      aiDifficulty: difficulty
    });
    if (!result.ok) return { response: { ok: false, lines: [result.reason || "Could not create match."] } };
    return {
      response: { ok: true, lines: [`Started ${result.game.variantName} in room ${result.game.roomCode} with ${botCount} bot${botCount === 1 ? "" : "s"}.`] },
      roomEvent: result.role === "spectator" ? "roomJoined" : "roomCreated",
      roomPayload: { roomCode: result.game.roomCode, color: result.color, role: result.role, game: result.game },
      affectedRooms: affected.map((game) => game.roomCode),
      scheduleRoomCode: result.game.roomCode
    };
  }

  if (action === "exitMatch") {
    const affected = leaveCurrentRooms(socket, socket.id);
    return {
      response: { ok: true, lines: [affected.length ? "Exited current match." : "No active room membership found."] },
      affectedRooms: affected.map((game) => game.roomCode)
    };
  }

  return { response: { ok: false, lines: [`Unknown developer command: ${action}`] } };
}

function normaliseDevVariant(value) {
  const text = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (["normal", "normalchess", "2d", "standard", "standardchess"].includes(text)) return "normal";
  if (["threed", "3d", "3dchess", "three", "threechess"].includes(text)) return "threeD";
  return "threeD";
}

function normaliseDevTimeControl(value) {
  const text = String(value || "").trim().toLowerCase();
  return ["classical", "rapid", "blitz", "bullet"].includes(text) ? text : "rapid";
}

function normaliseDevDifficulty(value) {
  const text = String(value || "").trim().toLowerCase();
  return ["easy", "medium", "hard"].includes(text) ? text : "medium";
}

const pendingAITimers = new Map();

function scheduleAIMoveIfNeeded(game) {
  if (!isAITurn(game) || pendingAITimers.has(game.roomCode)) return;

  const delayMs = Number(game.ai?.delayMs || 650);
  const timerId = setTimeout(() => {
    pendingAITimers.delete(game.roomCode);

    const currentGame = rooms.get(game.roomCode);
    if (!currentGame || !isAITurn(currentGame)) return;

    tickGameClock(currentGame);
    if (!isAITurn(currentGame)) {
      io.to(currentGame.roomCode).emit("gameState", currentGame);
      return;
    }

    const result = runAIMove(currentGame);
    if (!result.ok) {
      currentGame.message = result.reason || "AI could not move.";
    }

    io.to(currentGame.roomCode).emit("gameState", currentGame);
    scheduleAIMoveIfNeeded(currentGame);
  }, delayMs);

  pendingAITimers.set(game.roomCode, timerId);
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Wacky Chess Variants server running on port ${PORT}`);
});


setInterval(() => {
  const affectedGames = tickAllRoomClocks();
  for (const game of affectedGames) {
    io.to(game.roomCode).emit("gameState", game);
    scheduleAIMoveIfNeeded(game);
  }
}, 1000);
