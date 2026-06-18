import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import { appendChatMessage, createRoom, forfeitGame, getLegalMovesForSocket, joinRoom, removeSocketFromRooms, rooms, tickAllRoomClocks, tickGameClock } from "./rooms.js";
import { attemptLegalMove } from "./rules/check.js";

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
  socket.on("createRoom", ({ name, variant, timeControl } = {}) => {
    const game = createRoom(socket, name, { variant, timeControl });
    socket.emit("roomCreated", { roomCode: game.roomCode, color: "white", role: "player", game });
    io.to(game.roomCode).emit("gameState", game);
  });

  socket.on("joinRoom", ({ roomCode, name } = {}) => {
    const result = joinRoom(socket, roomCode, name);
    if (!result.ok) {
      socket.emit("joinError", result.reason);
      return;
    }

    socket.emit("roomJoined", { roomCode: result.game.roomCode, color: result.color, role: result.role, game: result.game });
    io.to(result.game.roomCode).emit("gameState", result.game);
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

  socket.on("disconnect", () => {
    const affectedGames = removeSocketFromRooms(socket.id);
    for (const game of affectedGames) {
      io.to(game.roomCode).emit("gameState", game);
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Wacky Chess Variants server running on port ${PORT}`);
});


setInterval(() => {
  const affectedGames = tickAllRoomClocks();
  for (const game of affectedGames) {
    io.to(game.roomCode).emit("gameState", game);
  }
}, 1000);
