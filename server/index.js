import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import { addPieceToRoom, appendChatMessage, cancelQuickMatch, cleanupExpiredRooms, createDevMatch, createRoom, createRoomShout, endMatchByDev, findPlayersByName, forfeitGame, getDetailedRoomLines, getLegalMovesForSocket, getOpenMatches, getPlayerCountSnapshot, getRoomSnapshot, hasDeveloperMoveOverride, joinRoom, leaveCurrentRooms, listPiecesInRoom, removePieceFromRoom, removeSocketFromRooms, replacePlayerWithBotInRoom, quickMatch, replacePlayerWithRequesterInRoom, ROOM_CLEANUP_INTERVAL_MS, rooms, runDevUtilityCommand, setPlayerColourInRoom, setSpectatorOverride, setTimerForRoom, setTurnInRoom, spectateRoom, tickAllRoomClocks, tickGameClock } from "./rooms.js";
import { attemptLegalMove, attemptLegalDrop } from "./rules/check.js";
import { chooseAIMove, evaluateAIPosition, isAITurn, runAIMove, scoreAICandidates } from "./rules/ai.js";
import { createHash, pbkdf2Sync, timingSafeEqual } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3001;

const DEV_PASSWORD_SALT = "wcv-dev-console-v1-salt";
const DEV_PASSWORD_HASH = "716b38d8fc25690f55750b70a610c967e1ed93c67095dab364958ef51bd8858f";
const devAuthenticatedSockets = new Set();

function verifyDevPassword(password) {
  const digest = pbkdf2Sync(String(password || ""), DEV_PASSWORD_SALT, 120000, 32, "sha256").toString("hex");
  try {
    return timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(DEV_PASSWORD_HASH, "hex"));
  } catch {
    return false;
  }
}

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


  socket.on("quickMatch", ({ name, variant, timeControl, scope } = {}) => {
    const result = quickMatch(socket, name, { variant, timeControl, scope });
    if (!result.ok) {
      socket.emit("matchmakingError", result.reason || "Quick match failed.");
      return;
    }

    socket.emit("roomJoined", {
      roomCode: result.roomCode || result.game.roomCode,
      color: result.color,
      role: result.role,
      game: result.game
    });
    socket.emit("matchmakingStatus", {
      searching: result.created && !result.matched,
      matched: result.matched,
      roomCode: result.roomCode || result.game.roomCode,
      scope: result.scope
    });
    io.to(result.game.roomCode).emit("gameState", result.game);
    scheduleAIMoveIfNeeded(result.game);
  });

  socket.on("cancelQuickMatch", () => {
    const result = cancelQuickMatch(socket.id);
    socket.emit("matchmakingStatus", { searching: false, cancelled: result.ok });
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
    const result = attemptLegalMove(game, socket.id, pieceId, to, {
      promotion,
      devOverride: hasDeveloperMoveOverride(socket.id, game.roomCode)
    });
    if (!result.ok) {
      socket.emit("invalidMove", result.reason);
      return;
    }

    io.to(game.roomCode).emit("gameState", game);
    scheduleAIMoveIfNeeded(game);
  });

  socket.on("attemptDrop", ({ roomCode, pieceType, to } = {}) => {
    const game = rooms.get(String(roomCode ?? "").trim().toUpperCase());
    if (!game) {
      socket.emit("invalidMove", "Room not found.");
      return;
    }

    tickGameClock(game);
    const result = attemptLegalDrop(game, socket.id, pieceType, to, {
      devOverride: hasDeveloperMoveOverride(socket.id, game.roomCode)
    });
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
    if (result?.shoutRoomCode && result?.shoutPayload) {
      io.to(result.shoutRoomCode).emit("shoutMessage", result.shoutPayload);
    }
    if (result?.scheduleRoomCode) {
      const game = rooms.get(result.scheduleRoomCode);
      if (game) {
        io.to(game.roomCode).emit("gameState", game);
        scheduleAIMoveIfNeeded(game);
      }
    }
  });

  socket.on("disconnect", () => {
    devAuthenticatedSockets.delete(socket.id);
    const affectedGames = removeSocketFromRooms(socket.id);
    for (const game of affectedGames) {
      io.to(game.roomCode).emit("gameState", game);
    }
  });
});


function handleDevCommand(socket, payload = {}) {
  const action = String(payload.action || "").trim();

  if (action === "devUnlock") {
    if (verifyDevPassword(payload.password)) {
      devAuthenticatedSockets.add(socket.id);
      return { response: { ok: true, unlocked: true, lines: ["developer console unlocked."] } };
    }
    return { response: { ok: false, lines: [] } };
  }

  if (!devAuthenticatedSockets.has(socket.id)) {
    return { response: { ok: false, lines: [] } };
  }
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



  if (action === "addPiece") {
    if (!currentRoomCode) return { response: { ok: false, lines: ["No current room. Use joincode/spectatematch/startmatch first."] } };
    const parsed = consumeLocationArgs(args);
    if (!parsed) return { response: { ok: false, lines: ["Usage: addpiece [x,y,z | e4 | x y z] [piecetype] [colour=turn]"] } };
    const pieceType = args[parsed.nextIndex];
    const color = args[parsed.nextIndex + 1];
    const result = addPieceToRoom(currentRoomCode, parsed.location, pieceType, color);
    if (!result.ok) return { response: { ok: false, lines: [result.reason] } };
    return {
      response: { ok: true, lines: result.lines || ["Piece added."] },
      gameStateRoom: currentRoomCode,
      scheduleRoomCode: currentRoomCode
    };
  }

  if (action === "removePiece") {
    if (!currentRoomCode) return { response: { ok: false, lines: ["No current room. Use joincode/spectatematch/startmatch first."] } };
    const parsed = consumeLocationArgs(args);
    if (!parsed) return { response: { ok: false, lines: ["Usage: removepiece [x,y,z | e4 | x y z]"] } };
    const result = removePieceFromRoom(currentRoomCode, parsed.location);
    if (!result.ok) return { response: { ok: false, lines: [result.reason] } };
    return {
      response: { ok: true, lines: result.lines || ["Piece removed."] },
      gameStateRoom: currentRoomCode,
      scheduleRoomCode: currentRoomCode
    };
  }

  if (action === "replaceWithBot") {
    if (!currentRoomCode) return { response: { ok: false, lines: ["No current room. Use joincode/spectatematch/startmatch first."] } };
    if (args.length < 1) return { response: { ok: false, lines: ["Usage: replacewithbot [name] [difficulty=medium]"] } };
    const maybeDifficulty = normaliseDevDifficulty(args[args.length - 1]);
    const lastArgLooksDifficulty = ["easy", "medium", "hard"].includes(String(args[args.length - 1] || "").trim().toLowerCase());
    const targetName = (lastArgLooksDifficulty ? args.slice(0, -1) : args).join(" ").trim();
    const difficulty = lastArgLooksDifficulty ? maybeDifficulty : "medium";
    const result = replacePlayerWithBotInRoom(currentRoomCode, targetName, difficulty);
    if (!result.ok) return { response: { ok: false, lines: [result.reason] } };
    return {
      response: { ok: true, lines: result.lines || ["Player replaced with bot."] },
      gameStateRoom: currentRoomCode,
      scheduleRoomCode: currentRoomCode
    };
  }

  if (action === "replacePlayer") {
    if (!currentRoomCode) return { response: { ok: false, lines: ["No current room. Use joincode/spectatematch/startmatch first."] } };
    const targetName = args.join(" ").trim();
    if (!targetName) return { response: { ok: false, lines: ["Usage: replaceplayer [name]"] } };
    const result = replacePlayerWithRequesterInRoom(currentRoomCode, targetName, socket.id, name);
    if (!result.ok) return { response: { ok: false, lines: [result.reason] } };
    return {
      response: { ok: true, lines: result.lines || ["Player replaced."] },
      roomEvent: "roomJoined",
      roomPayload: { roomCode: result.game.roomCode, color: result.color, role: "player", game: result.game },
      gameStateRoom: currentRoomCode,
      scheduleRoomCode: currentRoomCode
    };
  }


  if (action === "endMatch") {
    if (!currentRoomCode) return { response: { ok: false, lines: ["No current room. Use joincode/spectatematch/startmatch first."] } };
    const result = endMatchByDev(currentRoomCode, args[0] || "none");
    if (!result.ok) return { response: { ok: false, lines: [result.reason] } };
    return {
      response: { ok: true, lines: result.lines || ["Match ended."] },
      gameStateRoom: currentRoomCode
    };
  }

  if (action === "findPlayer") {
    const query = args.join(" ").trim();
    if (!query) return { response: { ok: false, lines: ["Usage: findplayer [name]"] } };
    const matches = findPlayersByName(query);
    return {
      response: {
        ok: true,
        lines: matches.length
          ? matches.map((player) => `${player.name} | ${player.color} ${player.role} | ${player.roomCode} | ${player.variantName} | ${player.status}`)
          : [`No players found matching: ${query}`]
      }
    };
  }

  if (action === "playerCount") {
    const counts = getPlayerCountSnapshot();
    return {
      response: {
        ok: true,
        lines: [
          `Rooms: ${counts.rooms} (${counts.activeRooms} playing)`,
          `Human players: ${counts.humanPlayers}`,
          `Spectators: ${counts.spectators}`,
          `Bots: ${counts.bots}`,
          `Unique connected humans in rooms: ${counts.uniqueHumans}`
        ]
      }
    };
  }

  if (action === "spectatorOverride") {
    if (!currentRoomCode) return { response: { ok: false, lines: ["No current room. Use joincode/spectatematch/startmatch first."] } };
    const target = args.join(" ").trim() || "self";
    const result = setSpectatorOverride(currentRoomCode, target, socket.id, true);
    if (!result.ok) return { response: { ok: false, lines: [result.reason] } };
    return {
      response: { ok: true, lines: result.lines || ["Override enabled."] },
      gameStateRoom: currentRoomCode
    };
  }

  if (action === "clearOverride") {
    if (!currentRoomCode) return { response: { ok: false, lines: ["No current room. Use joincode/spectatematch/startmatch first."] } };
    const target = args.join(" ").trim() || "self";
    const result = setSpectatorOverride(currentRoomCode, target, socket.id, false);
    if (!result.ok) return { response: { ok: false, lines: [result.reason] } };
    return {
      response: { ok: true, lines: result.lines || ["Override disabled."] },
      gameStateRoom: currentRoomCode
    };
  }

  if (action === "setTimer") {
    if (!currentRoomCode) return { response: { ok: false, lines: ["No current room. Use joincode/spectatematch/startmatch first."] } };
    const result = setTimerForRoom(currentRoomCode, args[0], args[1]);
    if (!result.ok) return { response: { ok: false, lines: [result.reason] } };
    return {
      response: { ok: true, lines: result.lines || ["Timer set."] },
      gameStateRoom: currentRoomCode,
      scheduleRoomCode: currentRoomCode
    };
  }

  if (action === "setPlayerColour") {
    if (!currentRoomCode) return { response: { ok: false, lines: ["No current room. Use joincode/spectatematch/startmatch first."] } };
    if (args.length < 2) return { response: { ok: false, lines: ["Usage: setplayercolour [name] [white|black|spectator]"] } };
    const targetColor = args[args.length - 1];
    const targetName = args.slice(0, -1).join(" ");
    const result = setPlayerColourInRoom(currentRoomCode, targetName, targetColor);
    if (!result.ok) return { response: { ok: false, lines: [result.reason] } };
    return {
      response: { ok: true, lines: result.lines || ["Player colour changed."] },
      gameStateRoom: currentRoomCode,
      scheduleRoomCode: currentRoomCode
    };
  }

  if (action === "listPieces") {
    if (!currentRoomCode) return { response: { ok: false, lines: ["No current room. Use joincode/spectatematch/startmatch first."] } };
    const result = listPiecesInRoom(currentRoomCode, args[0]);
    if (!result.ok) return { response: { ok: false, lines: [result.reason] } };
    return {
      response: { ok: true, lines: result.lines.length ? result.lines : ["No matching pieces."] }
    };
  }

  if (action === "setTurn") {
    if (!currentRoomCode) return { response: { ok: false, lines: ["No current room. Use joincode/spectatematch/startmatch first."] } };
    const result = setTurnInRoom(currentRoomCode, args[0]);
    if (!result.ok) return { response: { ok: false, lines: [result.reason] } };
    return {
      response: { ok: true, lines: result.lines || ["Turn set."] },
      gameStateRoom: currentRoomCode,
      scheduleRoomCode: currentRoomCode
    };
  }

  if (action === "shout") {
    if (!currentRoomCode) return { response: { ok: false, lines: ["No current room. Use joincode/spectatematch/startmatch first."] } };
    const result = createRoomShout(currentRoomCode, args.join(" "), name);
    if (!result.ok) return { response: { ok: false, lines: [result.reason] } };
    return {
      response: { ok: true, lines: result.lines || ["Shout sent."] },
      shoutRoomCode: result.roomCode,
      shoutPayload: { message: result.message, from: result.from }
    };
  }

  if (action === "listRoomsDetailed") {
    return { response: { ok: true, lines: getDetailedRoomLines() } };
  }

  if (action === "aiThink" || action === "topMoves" || action === "evalPosition" || action === "forceAIMove") {
    const game = rooms.get(currentRoomCode);
    if (!game) return { response: { ok: false, lines: ["No current room. Use joincode/spectatematch/startmatch first."] } };
    const color = normaliseDevColour(args[0]) || game.turn;
    if (action === "evalPosition") {
      return { response: { ok: true, lines: [`AI evaluation for ${color}: ${Math.round(evaluateAIPosition(game, color))}`] } };
    }
    const topN = Math.min(20, Math.max(1, Number.parseInt(args[1] || args[0], 10) || 5));
    const scored = scoreAICandidates(game, color).slice(0, topN);
    if (action === "topMoves" || action === "aiThink") {
      return { response: { ok: true, lines: scored.length ? scored.map((m, i) => `${i + 1}. ${m.pieceType} ${fmtDevLoc(m.from)} → ${fmtDevLoc(m.to)} score=${Math.round(m.score)}`) : ["No AI candidates."] } };
    }
    if (action === "forceAIMove") {
      const previousTurn = game.turn;
      game.turn = color;
      if (!game.ai) game.ai = {};
      game.ai.enabled = true;
      game.ai.colors = Array.from(new Set([...(game.ai.colors || []), color]));
      const result = runAIMove(game);
      if (!result.ok) game.turn = previousTurn;
      return { response: { ok: result.ok, lines: [result.ok ? `Forced ${color} AI move.` : result.reason] }, gameStateRoom: currentRoomCode, scheduleRoomCode: currentRoomCode };
    }
  }

  const utility = runDevUtilityCommand(currentRoomCode, action, args, socket.id, name);
  if (utility) {
    if (!utility.ok) return { response: { ok: false, lines: [utility.reason || "Command failed."] } };
    return { response: { ok: true, lines: utility.lines || ["OK"] }, gameStateRoom: currentRoomCode, scheduleRoomCode: currentRoomCode };
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


function consumeLocationArgs(args) {
  if (!Array.isArray(args) || args.length < 1) return null;

  const first = String(args[0] || "").trim();
  const chess = parseChessSquare(first);
  if (chess) return { location: chess, nextIndex: 1 };

  const packed = parseXYZ(first);
  if (packed) return { location: packed, nextIndex: 1 };

  if (args.length >= 3) {
    const x = Number.parseInt(args[0], 10);
    const y = Number.parseInt(args[1], 10);
    const z = Number.parseInt(args[2], 10);
    if ([x, y, z].every((value) => Number.isInteger(value))) return { location: { x, y, z }, nextIndex: 3 };
  }

  return null;
}

function parseXYZ(value) {
  const clean = String(value || "").trim().replace(/[()\[\]{}]/g, "");
  const parts = clean.split(/[,:/]/).map((part) => Number.parseInt(part.trim(), 10));
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return null;
  return { x: parts[0], y: parts[1], z: parts[2] };
}

function parseChessSquare(value) {
  const match = /^([a-h])([1-8])$/i.exec(String(value || "").trim());
  if (!match) return null;
  return { x: match[1].toLowerCase().charCodeAt(0) - 97, y: 0, z: Number(match[2]) - 1 };
}

function normaliseDevVariant(value) {
  const text = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (["normal", "normalchess", "2d", "standard", "standardchess"].includes(text)) return "normal";
  if (["chess960", "fischerrandom", "fischerandom", "960"].includes(text)) return "chess960";
  if (["crazyhouse", "crazy", "house"].includes(text)) return "crazyhouse";
  if (["kingofthehill", "koth", "hill", "kinghill"].includes(text)) return "kingOfTheHill";
  if (["atomic", "atomicchess"].includes(text)) return "atomic";
  if (["threed", "3d", "3dchess", "three", "threechess"].includes(text)) return "threeD";
  return "threeD";
}

function normaliseDevTimeControl(value) {
  const text = String(value || "").trim().toLowerCase();
  return ["classical", "rapid", "blitz", "bullet"].includes(text) ? text : "rapid";
}

function normaliseDevColour(value) {
  const text = String(value || "").trim().toLowerCase();
  if (["white", "w"].includes(text)) return "white";
  if (["black", "b"].includes(text)) return "black";
  return null;
}

function fmtDevLoc(pos) {
  return `(${pos.x},${pos.y},${pos.z})`;
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


setInterval(() => {
  const removed = cleanupExpiredRooms();
  if (removed.length) {
    console.log(`[cleanup] removed ${removed.length} closed room(s): ${removed.join(", ")}`);
  }
}, ROOM_CLEANUP_INTERVAL_MS);

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
