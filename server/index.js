import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import { addPieceToRoom, appendChatMessage, cancelQuickMatch, cleanupExpiredRooms, createDevMatch, createRoom, createRoomShout, endMatchByDev, findPlayersByName, forfeitGame, getDetailedRoomLines, getLegalMovesForSocket, getOpenMatches, getPlayerCountSnapshot, getRoomSnapshot, hasDeveloperMoveOverride, joinRoom, leaveCurrentRooms, listPiecesInRoom, removePieceFromRoom, removeSocketFromRooms, replacePlayerWithBotInRoom, quickMatch, replacePlayerWithRequesterInRoom, ROOM_CLEANUP_INTERVAL_MS, rooms, runDevUtilityCommand, setPlayerColourInRoom, setParticipantChatColourInRoom, setSpectatorOverride, setTimerForRoom, setTurnInRoom, spectateRoom, tickAllRoomClocks, tickGameClock } from "./rooms.js";
import { attemptLegalMove, attemptLegalDrop, attemptLaunchNuke, attemptTycoonAction, attemptScoobyAction, submitRuleLabGuess } from "./rules/check.js";
import { chooseAIMove, evaluateAIPosition, isAITurn, runAIMove, scoreAICandidates } from "./rules/ai.js";
import { cloneGame } from "./rules/utils.js";
import { createHash, pbkdf2Sync, timingSafeEqual } from "crypto";
import os from "os";
import { createAccount, loginAccount, logoutAccount, getPublicAccountByToken, getAccountByToken, participantAccount, getAccountInfoLines, getAccountListLines, recordCompletedGameForAccounts, accountStorePath, isRegisteredUsername, updateAccount, deleteAccount, devCreateAccount, forceProfileIcon, wipeAccountData, findAccount, findAccountById, publicAccount, accountHasConsoleAccess, getRankListLines, createRankType, deleteRankType, addRankToAccount, removeRankFromAccount, grantBadgeToAccount, revokeBadgeFromAccount, equipBadgeForAccount } from "./accountStore.js";
import { createReport, listReports, getReportCase, reportCaseLines, resolveReport, listAppeals, appealLines, resolveAppeal, submitAppeal, getActivePunishments, punishmentSummaryForClient, hasActivePunishment, listPunishments, addPunishmentForTarget, removePunishment, getSocialState, sendFriendRequest, respondFriendRequest, sendFriendMessage, createChallenge, respondChallenge, getLeaderboard, getElo, leaderboardLines, resetLeaderboard, clearLeaderboardForAccount, recordLeaderboardGame, publicProfile, socialStorePath } from "./socialStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3001;

const DEV_PASSWORD_SALT = "wcv-dev-console-v1-salt";
const DEV_PASSWORD_HASH = "716b38d8fc25690f55750b70a610c967e1ed93c67095dab364958ef51bd8858f";
const devAuthenticatedSockets = new Set();
const connectedClients = new Map();
const aiDifficultyAvailability = { all: { easy: true, medium: true, hard: true }, variants: {} };
const SITE_SETTINGS_PATH = path.join(__dirname, "data", "siteSettings.json");
const siteSettings = loadSiteSettings();
const networkStats = createNetworkStats();


function envFlag(name, fallback = true) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") return fallback;
  return !["0", "false", "no", "off", "disabled"].includes(String(value).trim().toLowerCase());
}

function loadSiteSettings() {
  const defaults = {
    supportUiEnabled: envFlag("SUPPORT_UI_ENABLED", true),
    updatedAt: Date.now()
  };

  try {
    if (!fs.existsSync(SITE_SETTINGS_PATH)) return defaults;
    const parsed = JSON.parse(fs.readFileSync(SITE_SETTINGS_PATH, "utf8"));
    return {
      ...defaults,
      ...(parsed && typeof parsed === "object" ? parsed : {}),
      supportUiEnabled: parsed?.supportUiEnabled !== undefined ? Boolean(parsed.supportUiEnabled) : defaults.supportUiEnabled
    };
  } catch (error) {
    console.warn(`[site-settings] failed to load ${SITE_SETTINGS_PATH}: ${error.message}`);
    return defaults;
  }
}

function saveSiteSettings() {
  try {
    fs.mkdirSync(path.dirname(SITE_SETTINGS_PATH), { recursive: true });
    const tmp = `${SITE_SETTINGS_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(siteSettings, null, 2));
    fs.renameSync(tmp, SITE_SETTINGS_PATH);
  } catch (error) {
    console.warn(`[site-settings] failed to save ${SITE_SETTINGS_PATH}: ${error.message}`);
  }
}

function getPublicSiteSettings() {
  return {
    supportUiEnabled: siteSettings.supportUiEnabled !== false
  };
}

function setSupportUiEnabled(enabled) {
  siteSettings.supportUiEnabled = Boolean(enabled);
  siteSettings.updatedAt = Date.now();
  saveSiteSettings();
  return getPublicSiteSettings();
}

function emitSiteSettings(socket) {
  const payload = getPublicSiteSettings();
  recordOutgoing("siteSettings", payload, "GLOBAL", 1);
  socket.emit("siteSettings", payload);
}

function verifyDevPassword(password) {
  const digest = pbkdf2Sync(String(password || ""), DEV_PASSWORD_SALT, 120000, 32, "sha256").toString("hex");
  try {
    return timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(DEV_PASSWORD_HASH, "hex"));
  } catch {
    return false;
  }
}

function createNetworkStats() {
  const now = Date.now();
  return {
    startedAt: now,
    totalSentBytes: 0,
    totalReceivedBytes: 0,
    totalEventsOut: 0,
    totalEventsIn: 0,
    perRoom: new Map(),
    ai: {
      totalMs: 0,
      totalMoves: 0,
      byRoom: new Map(),
      byDifficulty: {
        easy: { ms: 0, moves: 0 },
        medium: { ms: 0, moves: 0 },
        hard: { ms: 0, moves: 0 }
      }
    },
    samples: [],
    lastCpuUsage: process.cpuUsage(),
    lastCpuAt: now
  };
}

function getRoomNetworkStats(roomCode) {
  const key = String(roomCode || "GLOBAL").toUpperCase();
  if (!networkStats.perRoom.has(key)) {
    networkStats.perRoom.set(key, {
      sentBytes: 0,
      receivedBytes: 0,
      eventsOut: 0,
      eventsIn: 0,
      aiMs: 0,
      aiMoves: 0,
      lastSentAt: 0,
      lastReceivedAt: 0
    });
  }
  return networkStats.perRoom.get(key);
}

function safePayloadBytes(payload) {
  try {
    return Buffer.byteLength(JSON.stringify(payload ?? null), "utf8");
  } catch {
    return Buffer.byteLength(String(payload ?? ""), "utf8");
  }
}

function recordOutgoing(eventName, payload, roomCode = null, targetCount = 1) {
  const bytes = safePayloadBytes(payload) * Math.max(1, targetCount || 1);
  networkStats.totalSentBytes += bytes;
  networkStats.totalEventsOut += 1;
  const stat = getRoomNetworkStats(roomCode || "GLOBAL");
  stat.sentBytes += bytes;
  stat.eventsOut += 1;
  stat.lastSentAt = Date.now();
  return bytes;
}

function recordIncoming(eventName, payload, roomCode = null) {
  const bytes = safePayloadBytes(payload);
  networkStats.totalReceivedBytes += bytes;
  networkStats.totalEventsIn += 1;
  const stat = getRoomNetworkStats(roomCode || "GLOBAL");
  stat.receivedBytes += bytes;
  stat.eventsIn += 1;
  stat.lastReceivedAt = Date.now();
  return bytes;
}

function recordAIMetrics(game, difficulty, elapsedMs) {
  const roomCode = game?.roomCode || "GLOBAL";
  const ms = Math.max(0, Number(elapsedMs) || 0);
  networkStats.ai.totalMs += ms;
  networkStats.ai.totalMoves += 1;
  const roomStat = getRoomNetworkStats(roomCode);
  roomStat.aiMs += ms;
  roomStat.aiMoves += 1;
  const aiRoom = networkStats.ai.byRoom.get(roomCode) || { ms: 0, moves: 0 };
  aiRoom.ms += ms;
  aiRoom.moves += 1;
  networkStats.ai.byRoom.set(roomCode, aiRoom);
  const diff = normaliseDevDifficulty(difficulty || game?.ai?.difficulty || "medium");
  networkStats.ai.byDifficulty[diff].ms += ms;
  networkStats.ai.byDifficulty[diff].moves += 1;
}

function approximateRoomMemoryBytes(game) {
  return safePayloadBytes(game);
}

function getCpuPercentSinceLastSample() {
  const now = Date.now();
  const elapsedMs = Math.max(1, now - networkStats.lastCpuAt);
  const current = process.cpuUsage();
  const userDelta = current.user - networkStats.lastCpuUsage.user;
  const systemDelta = current.system - networkStats.lastCpuUsage.system;
  const cpuMs = (userDelta + systemDelta) / 1000;
  const percent = Math.min(100 * os.cpus().length, (cpuMs / elapsedMs) * 100);
  networkStats.lastCpuUsage = current;
  networkStats.lastCpuAt = now;
  return percent;
}

function makeNetworkSample(scope = "overall", roomCode = null) {
  const now = Date.now();
  const memory = process.memoryUsage();
  const uptimeSeconds = Math.max(1, (now - networkStats.startedAt) / 1000);
  const cpuPercent = getCpuPercentSinceLastSample();
  const room = roomCode ? rooms.get(String(roomCode).toUpperCase()) : null;
  const roomStat = roomCode ? getRoomNetworkStats(roomCode) : null;
  const roomBytes = room ? approximateRoomMemoryBytes(room) : 0;
  const totalRoomMemory = Array.from(rooms.values()).reduce((sum, game) => sum + approximateRoomMemoryBytes(game), 0);
  const totalBandwidthBps = (networkStats.totalSentBytes + networkStats.totalReceivedBytes) / uptimeSeconds;
  const roomBandwidthBps = roomStat ? (roomStat.sentBytes + roomStat.receivedBytes) / uptimeSeconds : 0;
  const aiTotalMs = networkStats.ai.totalMs;
  const totalCpuProxyMs = Math.max(aiTotalMs, uptimeSeconds * 1000 * Math.max(0.01, cpuPercent / 100));
  const aiSharePercent = Math.min(100, (aiTotalMs / Math.max(1, totalCpuProxyMs)) * 100);

  const sample = {
    time: now,
    scope,
    roomCode: room?.roomCode || roomCode || null,
    server: {
      status: "online",
      uptimeSeconds,
      cpuPercent,
      cpuCount: os.cpus().length,
      loadAverage: os.loadavg(),
      memoryRss: memory.rss,
      memoryHeapUsed: memory.heapUsed,
      memoryHeapTotal: memory.heapTotal,
      systemMemoryUsed: os.totalmem() - os.freemem(),
      systemMemoryTotal: os.totalmem(),
      maxBandwidthBps: Number(process.env.MAX_SERVER_BANDWIDTH_BPS || 0)
    },
    overall: {
      rooms: rooms.size,
      clients: io.sockets.sockets.size,
      sentBytes: networkStats.totalSentBytes,
      receivedBytes: networkStats.totalReceivedBytes,
      eventsOut: networkStats.totalEventsOut,
      eventsIn: networkStats.totalEventsIn,
      bandwidthBps: totalBandwidthBps,
      roomMemoryBytes: totalRoomMemory,
      aiMs: networkStats.ai.totalMs,
      aiMoves: networkStats.ai.totalMoves,
      aiSharePercent
    },
    room: room ? {
      roomCode: room.roomCode,
      variant: room.variant,
      status: room.status,
      players: [room.players?.white?.name, room.players?.black?.name].filter(Boolean),
      spectators: room.spectators?.length || 0,
      memoryBytes: roomBytes,
      sentBytes: roomStat?.sentBytes || 0,
      receivedBytes: roomStat?.receivedBytes || 0,
      eventsOut: roomStat?.eventsOut || 0,
      eventsIn: roomStat?.eventsIn || 0,
      bandwidthBps: roomBandwidthBps,
      aiMs: roomStat?.aiMs || 0,
      aiMoves: roomStat?.aiMoves || 0,
      aiDifficulty: room.ai?.difficulty || null,
      aiColors: room.ai?.colors || []
    } : null,
    ai: {
      totalMs: networkStats.ai.totalMs,
      totalMoves: networkStats.ai.totalMoves,
      byDifficulty: networkStats.ai.byDifficulty,
      byRoom: Object.fromEntries(networkStats.ai.byRoom.entries())
    }
  };

  networkStats.samples.push(sample);
  if (networkStats.samples.length > 120) networkStats.samples.shift();
  return sample;
}

function getNetworkMetricsPayload({ scope = "overall", roomCode = null } = {}) {
  const sample = makeNetworkSample(scope, roomCode);
  const history = networkStats.samples
    .filter((item) => !roomCode || item.roomCode === roomCode || item.scope === "overall")
    .slice(-60)
    .map((item) => ({
      time: item.time,
      cpuPercent: item.server.cpuPercent,
      heapMb: bytesToMb(item.server.memoryHeapUsed),
      bandwidthKbps: (item.overall.bandwidthBps || 0) / 1024,
      aiMs: item.ai.totalMs,
      roomBandwidthKbps: (item.room?.bandwidthBps || 0) / 1024,
      roomMemoryKb: (item.room?.memoryBytes || 0) / 1024
    }));

  return { ...sample, history };
}

function capitalise(text) {
  const value = String(text || "");
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function guestNameBlocked(socket, requestedName) {
  if (socket.data?.account) return false;
  const clean = String(requestedName || "").trim();
  return clean && isRegisteredUsername(clean);
}

function punishmentIdentityForSocket(socket) {
  return {
    accountId: socket?.data?.account?.id || null,
    deviceId: socket?.data?.deviceId || null
  };
}

function getBlockingPunishment(socket, type) {
  const identity = punishmentIdentityForSocket(socket);
  const punishments = getActivePunishments(identity) || [];
  return punishments.find((punishment) => {
    if (!punishment?.active) return false;
    if (type === "ban") return punishment.type === "ban";
    if (type === "mute") return punishment.type === "mute";
    return punishment.type === type;
  }) || null;
}

function punishmentTimeLeftText(punishment) {
  if (!punishment) return "";
  if (punishment.expiresAt === -1) return "permanently";
  const remainingMs = Math.max(0, Number(punishment.expiresAt || 0) - Date.now());
  const minutes = Math.ceil(remainingMs / 60000);
  if (minutes <= 1) return "for less than 1 minute";
  if (minutes < 60) return `for ${minutes} minutes`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 48) return `for ${hours} hours`;
  return `until ${new Date(punishment.expiresAt).toLocaleString()}`;
}

function punishmentBlockedMessage(punishment) {
  if (!punishment) return "Action blocked by active punishment.";
  const typeText = punishment.type === "ban" ? "banned from joining games" : punishment.type === "mute" ? "muted from chat" : `punished (${punishment.type})`;
  const reason = punishment.reason ? ` Reason: ${punishment.reason}` : "";
  return `You are ${typeText} ${punishmentTimeLeftText(punishment)}.${reason}`;
}

function sendPunishmentNotice(socket) {
  const identity = punishmentIdentityForSocket(socket);
  const punishments = punishmentSummaryForClient(identity) || [];
  if (!punishments.length) return;
  const payload = {
    punishments,
    accountId: identity.accountId,
    deviceId: identity.deviceId,
    message: punishments.map((punishment) => punishmentBlockedMessage(punishment)).join("\n")
  };
  recordOutgoing("punishmentNotice", payload, connectedClients.get(socket.id)?.lastRoomCode || "GLOBAL", 1);
  socket.emit("punishmentNotice", payload);
}

function bytesToMb(value) {
  return Math.round((Number(value) || 0) / 1024 / 1024 * 10) / 10;
}

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${Math.round(bytes)} B`;
}

function networkSummaryLines(payload) {
  const lines = [
    `Server: ${payload.server.status} | uptime ${Math.round(payload.server.uptimeSeconds)}s | cpu ${payload.server.cpuPercent.toFixed(1)}% | load ${payload.server.loadAverage.map((v) => v.toFixed(2)).join(", ")}`,
    `Memory: heap ${formatBytes(payload.server.memoryHeapUsed)} / ${formatBytes(payload.server.memoryHeapTotal)} | rss ${formatBytes(payload.server.memoryRss)} | system ${formatBytes(payload.server.systemMemoryUsed)} / ${formatBytes(payload.server.systemMemoryTotal)}`,
    `Overall network: sent ${formatBytes(payload.overall.sentBytes)}, received ${formatBytes(payload.overall.receivedBytes)}, approx ${(payload.overall.bandwidthBps / 1024).toFixed(2)} KB/s`,
    `Rooms: ${payload.overall.rooms} | clients ${payload.overall.clients} | room memory ${formatBytes(payload.overall.roomMemoryBytes)}`,
    `AI: ${payload.ai.totalMoves} move(s), ${payload.ai.totalMs.toFixed(1)} ms total, approx ${payload.overall.aiSharePercent.toFixed(1)}% of measured CPU proxy`
  ];
  if (payload.room) {
    lines.push(
      `Room ${payload.room.roomCode}: ${payload.room.variant} | ${payload.room.status} | ${payload.room.players.join(" vs ") || "no players"} | spectators ${payload.room.spectators}`,
      `Room memory ${formatBytes(payload.room.memoryBytes)} | sent ${formatBytes(payload.room.sentBytes)} | received ${formatBytes(payload.room.receivedBytes)} | approx ${(payload.room.bandwidthBps / 1024).toFixed(2)} KB/s`,
      `Room AI: difficulty ${payload.room.aiDifficulty || "none"} | colors ${(payload.room.aiColors || []).join(",") || "none"} | ${payload.room.aiMoves} move(s), ${payload.room.aiMs.toFixed(1)} ms`
    );
  }
  const difficultyLines = Object.entries(payload.ai.byDifficulty).map(([difficulty, stat]) => `${difficulty}: ${stat.moves} move(s), ${stat.ms.toFixed(1)} ms`);
  lines.push(`AI by difficulty: ${difficultyLines.join(" | ")}`);
  if (payload.server.maxBandwidthBps) lines.push(`Configured max bandwidth: ${formatBytes(payload.server.maxBandwidthBps)}/s`);
  else lines.push("Configured max bandwidth: not available from host env. Set MAX_SERVER_BANDWIDTH_BPS to display it.");
  return lines;
}

function getAIAvailabilityPayload(variantRaw = null) {
  const variant = variantRaw ? normaliseDevVariant(variantRaw) : null;
  const flat = { ...aiDifficultyAvailability.all };
  if (variant && aiDifficultyAvailability.variants?.[variant]) Object.assign(flat, aiDifficultyAvailability.variants[variant]);
  return { ...flat, all: { ...aiDifficultyAvailability.all }, variants: JSON.parse(JSON.stringify(aiDifficultyAvailability.variants || {})) };
}

function setAIDifficultyAvailability(difficulty, enabled, variantRaw = "all") {
  const diff = normaliseDevDifficulty(difficulty);
  const variantText = String(variantRaw || "all").trim();
  const isGlobal = !variantText || variantText.toLowerCase() === "all";
  if (isGlobal) {
    aiDifficultyAvailability.all[diff] = Boolean(enabled);
  } else {
    const variant = normaliseDevVariant(variantText);
    if (!aiDifficultyAvailability.variants[variant]) aiDifficultyAvailability.variants[variant] = {};
    aiDifficultyAvailability.variants[variant][diff] = Boolean(enabled);
  }
  return getAIAvailabilityPayload();
}

function isAIDifficultyEnabled(difficulty, variantRaw = "all") {
  const diff = normaliseDevDifficulty(difficulty);
  const variant = normaliseDevVariant(variantRaw || "normal");
  if (aiDifficultyAvailability.variants?.[variant]?.[diff] !== undefined) return aiDifficultyAvailability.variants[variant][diff] !== false;
  return aiDifficultyAvailability.all[diff] !== false;
}

function parseOriginList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getSocketAllowedOrigins() {
  const localOrigins = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3001", "http://127.0.0.1:3001"];
  const configuredOrigins = [
    ...parseOriginList(process.env.CLIENT_ORIGINS),
    ...parseOriginList(process.env.PUBLIC_SITE_URL),
    ...parseOriginList(process.env.RENDER_EXTERNAL_URL),
    ...parseOriginList(process.env.VITE_PUBLIC_SITE_URL)
  ];
  const origins = Array.from(new Set([...(process.env.NODE_ENV === "production" ? [] : localOrigins), ...configuredOrigins]));
  return origins.length ? origins : (process.env.NODE_ENV === "production" ? false : localOrigins);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: getSocketAllowedOrigins(),
    methods: ["GET", "POST"]
  }
});

const clientDist = path.join(__dirname, "../client/dist");
const profileIconDirs = [
  path.join(clientDist, "profile-icons"),
  path.join(__dirname, "../client/public/profile-icons")
];
const badgeIconDirs = [
  path.join(clientDist, "badges"),
  path.join(__dirname, "../client/public/badges")
];
app.use(express.static(clientDist));


function getProfileIconList() {
  const allowed = new Set();
  for (const dir of profileIconDirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      for (const file of fs.readdirSync(dir)) {
        if (/^[a-zA-Z0-9_.-]+\.(svg|png|jpg|jpeg|webp)$/i.test(file)) allowed.add(file);
      }
    } catch (error) {
      console.warn(`[profile-icons] failed to read ${dir}: ${error.message}`);
    }
  }
  if (!allowed.size) allowed.add("lab-pawn.svg");
  return Array.from(allowed).sort();
}

function emitProfileIcons(socket) {
  const payload = { icons: getProfileIconList(), basePath: "/profile-icons/" };
  recordOutgoing("profileIcons", payload, "GLOBAL", 1);
  socket.emit("profileIcons", payload);
}

function cleanBadgeArg(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const withoutPrefix = raw.replace(/^Badge=/i, "").trim();
  const unquoted = withoutPrefix.replace(/^(["'])(.*)\1$/, "$2").trim();
  if (!unquoted || ["null", "none", "false", "no", "off"].includes(unquoted.toLowerCase())) return null;
  return unquoted;
}

function getBadgeCatalog() {
  const allowed = new Set();
  for (const dir of badgeIconDirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      for (const file of fs.readdirSync(dir)) {
        if (/^[a-zA-Z0-9_.-]+\.(svg|png|jpg|jpeg|webp)$/i.test(file)) allowed.add(file);
      }
    } catch (error) {
      console.warn(`[badges] failed to read ${dir}: ${error.message}`);
    }
  }
  return Array.from(allowed).sort();
}

function emitBadgeCatalog(socket) {
  const payload = { badges: getBadgeCatalog(), basePath: "/badges/" };
  recordOutgoing("badgeCatalog", payload, "GLOBAL", 1);
  socket.emit("badgeCatalog", payload);
}

function refreshAccountParticipantInRooms(socketId, account) {
  if (!socketId || !account) return [];
  const affected = [];
  for (const game of rooms.values()) {
    let changed = false;
    for (const color of ["white", "black"]) {
      const player = game.players?.[color];
      if (player?.id === socketId) {
        player.name = account.username;
        player.accountId = account.id;
        player.accountName = account.username;
        player.profile = account.profile || player.profile || {};
        changed = true;
      }
    }
    for (const spectator of game.spectators || []) {
      if (spectator.id === socketId) {
        spectator.name = account.username;
        spectator.accountId = account.id;
        spectator.accountName = account.username;
        spectator.profile = account.profile || spectator.profile || {};
        changed = true;
      }
    }
    if (changed) affected.push(game);
  }
  return affected;
}

function accountPresenceLines(queryRaw = "") {
  const account = findAccount(queryRaw);
  if (!account) return { ok: false, lines: ["Account not found."] };
  const sockets = Array.from(io.sockets.sockets.values()).filter((socket) => socket.data?.account?.id === account.id);
  const roomMemberships = [];
  for (const game of rooms.values()) {
    if (game.players?.white?.accountId === account.id) roomMemberships.push(`${game.roomCode}: white (${game.variantName})`);
    if (game.players?.black?.accountId === account.id) roomMemberships.push(`${game.roomCode}: black (${game.variantName})`);
    for (const spectator of game.spectators || []) {
      if (spectator.accountId === account.id) roomMemberships.push(`${game.roomCode}: spectator (${game.variantName})`);
    }
  }
  const lines = [
    `Account: ${account.username}`,
    `ID: ${account.id}`,
    `Online: ${sockets.length ? "yes" : "no"}`,
    `Sockets: ${sockets.length || 0}`,
    `Room membership: ${roomMemberships.join(", ") || "none"}`
  ];
  for (const socket of sockets) {
    const client = connectedClients.get(socket.id);
    const games = [];
    for (const game of rooms.values()) {
      if (game.players?.white?.id === socket.id) games.push(`${game.roomCode}: white (${game.variantName})`);
      if (game.players?.black?.id === socket.id) games.push(`${game.roomCode}: black (${game.variantName})`);
      if ((game.spectators || []).some((spectator) => spectator.id === socket.id)) games.push(`${game.roomCode}: spectator (${game.variantName})`);
    }
    lines.push(`${socket.id} | ${client?.lastRoomCode || "lobby"} | ${games.join(", ") || "not in game"}`);
  }
  return { ok: true, lines };
}



function getRoomSocketIds(game) {
  if (!game) return [];
  return [
    game.players?.white?.id,
    game.players?.black?.id,
    ...(game.spectators || []).map((spectator) => spectator.id)
  ].filter(Boolean);
}

function parseCloseRoomArgs(args = [], currentRoomCode = null) {
  const first = String(args[0] || "").trim().toUpperCase();
  const firstIsRoom = Boolean(first && rooms.has(first));
  const roomCode = firstIsRoom ? first : String(currentRoomCode || first || "").trim().toUpperCase();
  const reason = (firstIsRoom ? args.slice(1) : args).join(" ").trim() || "Closed by developer";
  return { roomCode, reason };
}

function participantForPunishment(game, queryRaw = "") {
  if (!game) return null;
  const query = String(queryRaw || "").trim().toLowerCase();
  const candidates = [
    game.players?.white ? { ...game.players.white, color: "white", role: "player" } : null,
    game.players?.black ? { ...game.players.black, color: "black", role: "player" } : null,
    ...(game.spectators || []).map((spectator) => ({ ...spectator, role: "spectator" }))
  ].filter(Boolean);
  if (["white", "w"].includes(query)) return candidates.find((item) => item.color === "white") || null;
  if (["black", "b"].includes(query)) return candidates.find((item) => item.color === "black") || null;
  return candidates.find((item) => String(item.name || "").toLowerCase() === query || String(item.accountName || "").toLowerCase() === query || String(item.accountId || "").toLowerCase() === query || String(item.id || "").toLowerCase() === query) || null;
}

function devPunishmentTarget(targetQuery, currentRoomCode = null) {
  const raw = String(targetQuery || "").trim();
  if (!raw) return null;
  const account = findAccount(raw);
  if (account) return { type: "account", accountId: account.id, accountName: account.username, name: account.username };

  const game = currentRoomCode ? rooms.get(String(currentRoomCode).trim().toUpperCase()) : null;
  const participant = participantForPunishment(game, raw);
  if (participant) {
    const socket = io.sockets.sockets.get(participant.id);
    return {
      type: participant.accountId ? "account" : "device",
      accountId: participant.accountId || null,
      accountName: participant.accountName || null,
      deviceId: socket?.data?.deviceId || participant.deviceId || null,
      socketId: participant.id,
      name: participant.name || raw
    };
  }

  if (/^[a-zA-Z0-9:_-]{8,128}$/.test(raw)) return { type: "device", deviceId: raw, name: raw };
  return null;
}

function notifyPunishedClients(punishment) {
  if (!punishment) return;
  for (const targetSocket of io.sockets.sockets.values()) {
    const identity = punishmentIdentityForSocket(targetSocket);
    const matchesAccount = punishment.accountId && identity.accountId === punishment.accountId;
    const matchesDevice = punishment.deviceId && identity.deviceId === punishment.deviceId;
    if (matchesAccount || matchesDevice) sendPunishmentNotice(targetSocket);
  }
}

function recordIllegalMoveAttempt(game, socket, reason = "Illegal move") {
  if (!game) return;
  if (!Array.isArray(game.illegalMoveAttempts)) game.illegalMoveAttempts = [];
  const viewerColor = getViewerColor(game, socket?.id);
  const account = socket?.data?.account || null;
  game.illegalMoveAttempts.push({
    id: `illegal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    time: Date.now(),
    roomCode: game.roomCode,
    variant: game.variant,
    player: account?.username || connectedClients.get(socket?.id)?.name || "Guest",
    color: viewerColor,
    socketId: socket?.id || null,
    accountId: account?.id || null,
    deviceId: socket?.data?.deviceId || null,
    reason: String(reason || "Illegal move").slice(0, 240),
    moveCount: game.moveHistory?.length || 0
  });
  game.illegalMoveAttempts = game.illegalMoveAttempts.slice(-120);
}

function markFirstMoveAndMaybeStartTimer(game) {
  if (!game || game.status !== "playing") return;
  if (!game.players?.white || !game.players?.black) return;
  if (game.variant === "ruleLab") return;
  if (game.unlimitedTime || game.clockInitialMs == null) {
    game.timerStarted = false;
    game.clockWaitingForBothPlayers = false;
    game.lastTurnStartedAt = null;
    return;
  }
  if (!game.firstMoveMadeBy) game.firstMoveMadeBy = { white: false, black: false };
  const mover = game.turn === "white" ? "black" : "white";
  const timerWasRunning = Boolean(game.timerStarted && !game.timerPaused);
  if (mover === "white" || mover === "black") game.firstMoveMadeBy[mover] = true;
  if (timerWasRunning && Number(game.incrementMs || 0) > 0 && game.clocks?.[mover] != null) {
    game.clocks[mover] = Math.max(0, Number(game.clocks[mover] || 0)) + Number(game.incrementMs || 0);
  }
  const bothMoved = Boolean(game.firstMoveMadeBy.white && game.firstMoveMadeBy.black);
  if (!bothMoved) {
    game.timerStarted = false;
    game.lastTurnStartedAt = null;
    game.clockWaitingForBothPlayers = true;
    return;
  }
  if (!game.timerStarted || game.clockWaitingForBothPlayers || !game.clocksStartedAt) {
    game.timerStarted = true;
    game.clockWaitingForBothPlayers = false;
    game.clocksStartedAt = Date.now();
    game.lastTurnStartedAt = Date.now();
  }
}

function socketIdentity(socket) {
  const account = socket?.data?.account || null;
  const client = connectedClients.get(socket?.id) || {};
  return {
    socketId: socket?.id || null,
    accountId: account?.id || null,
    accountName: account?.username || null,
    name: account?.username || client.name || "Guest",
    deviceId: socket?.data?.deviceId || null,
    guest: !account
  };
}

function socketsForAccount(accountId) {
  if (!accountId) return [];
  return Array.from(io.sockets.sockets.values()).filter((targetSocket) => targetSocket.data?.account?.id === accountId);
}

function activeRoomsForAccount(accountId) {
  if (!accountId) return [];
  const memberships = [];
  for (const game of rooms.values()) {
    if (game.players?.white?.accountId === accountId) memberships.push({ roomCode: game.roomCode, role: "white", variant: game.variant, variantName: game.variantName, status: game.status });
    if (game.players?.black?.accountId === accountId) memberships.push({ roomCode: game.roomCode, role: "black", variant: game.variant, variantName: game.variantName, status: game.status });
    for (const spectator of game.spectators || []) {
      if (spectator.accountId === accountId) memberships.push({ roomCode: game.roomCode, role: "spectator", variant: game.variant, variantName: game.variantName, status: game.status });
    }
  }
  return memberships;
}

function enrichSocialStateForAccount(accountId) {
  const state = getSocialState(accountId);
  if (!state) return null;
  const enrichFriend = (friend) => {
    const sockets = socketsForAccount(friend.accountId);
    const roomsForFriend = activeRoomsForAccount(friend.accountId);
    return {
      ...friend,
      online: sockets.length > 0,
      inGame: roomsForFriend.some((room) => room.role === "white" || room.role === "black"),
      rooms: roomsForFriend,
      lastSeen: sockets.length ? Date.now() : null
    };
  };
  return {
    ...state,
    friends: (state.friends || []).map(enrichFriend),
    challenges: (state.challenges || []).map((challenge) => {
      const from = findAccount(challenge.fromAccountId);
      return { ...challenge, fromUsername: from?.username || "Unknown" };
    }),
    outgoingRequests: (state.outgoingRequests || []).map((request) => ({
      ...request,
      targetOnline: socketsForAccount(request.toAccountId).length > 0
    }))
  };
}

function emitSocialStateToSocket(socket) {
  const account = socket?.data?.account || null;
  if (!socket || !account) return;
  const payload = enrichSocialStateForAccount(account.id);
  if (!payload) return;
  recordOutgoing("socialState", payload, connectedClients.get(socket.id)?.lastRoomCode || "GLOBAL", 1);
  socket.emit("socialState", payload);
}

function emitSocialStateForAccounts(accountIds = []) {
  const ids = new Set((Array.isArray(accountIds) ? accountIds : [accountIds]).filter(Boolean));
  for (const targetSocket of io.sockets.sockets.values()) {
    if (ids.has(targetSocket.data?.account?.id)) emitSocialStateToSocket(targetSocket);
  }
}

function opponentAccountForSocket(game, socketId) {
  if (!game || !socketId) return null;
  const isWhite = game.players?.white?.id === socketId;
  const isBlack = game.players?.black?.id === socketId;
  const opponent = isWhite ? game.players?.black : isBlack ? game.players?.white : null;
  if (!opponent) return null;
  return {
    socketId: opponent.id || null,
    name: opponent.name || "Opponent",
    accountId: opponent.accountId || null,
    accountName: opponent.accountName || opponent.name || null,
    guest: !opponent.accountId
  };
}

function handleFriendRequestCommand(socket, targetQuery) {
  const account = socket?.data?.account;
  if (!account) { socket.emit("chatError", "Log in first to send friend requests."); return; }
  const target = String(targetQuery || "").trim();
  if (!target) { socket.emit("chatError", "No account target found for friend request."); return; }
  const result = sendFriendRequest(account.id, target);
  if (!result.ok) { socket.emit("chatError", result.reason); return; }
  socket.emit("chatError", `Friend request sent to ${result.targetAccount.username}.`);
  emitSocialStateForAccounts([account.id, result.targetAccount.id]);
}

function handleFriendAcceptCommand(socket, fromQuery) {
  const account = socket?.data?.account;
  if (!account) { socket.emit("chatError", "Log in first to accept friend requests."); return; }
  const target = String(fromQuery || "").trim();
  if (!target) { socket.emit("chatError", "Use !accept [username or request id]."); return; }
  const result = respondFriendRequest(account.id, target, true);
  if (!result.ok) { socket.emit("chatError", result.reason); return; }
  socket.emit("chatError", "Friend request accepted.");
  emitSocialStateForAccounts([result.request.fromAccountId, result.request.toAccountId]);
}

function notifyChallenge(challenge) {
  if (!challenge) return;
  const from = findAccount(challenge.fromAccountId);
  const payload = { challenge: { ...challenge, fromUsername: from?.username || "Friend" } };
  for (const targetSocket of socketsForAccount(challenge.toAccountId)) {
    recordOutgoing("challengeNotice", payload, connectedClients.get(targetSocket.id)?.lastRoomCode || "GLOBAL", 1);
    targetSocket.emit("challengeNotice", payload);
  }
}

function makeMatchFoundPayload(game, viewerSocketId = null) {
  const entryFor = (color) => {
    const player = game?.players?.[color] || null;
    if (!player) return null;
    const accountId = player.accountId || null;
    let rank = null;
    let elo = accountId ? getLeaderboard(game.variant, "month", 1000).entries.find((entry, index) => {
      if (entry.accountId === accountId) { rank = index + 1; return true; }
      return false;
    })?.elo : null;
    return {
      color,
      name: player.name || capitalise(color),
      accountId,
      guest: !accountId,
      elo: elo || (accountId ? 800 : null),
      rank
    };
  };
  return {
    roomCode: game?.roomCode || null,
    variant: game?.variant || null,
    variantName: game?.variantName || null,
    viewerColor: getViewerColor(game, viewerSocketId),
    white: entryFor("white"),
    black: entryFor("black")
  };
}

function startAcceptedChallenge(acceptingSocket, challenge, acceptingName = "Player") {
  const fromSocket = socketsForAccount(challenge.fromAccountId)[0];
  const toSocket = acceptingSocket || socketsForAccount(challenge.toAccountId)[0];
  if (!fromSocket || !toSocket) {
    if (toSocket) toSocket.emit("socialError", "The challenger is no longer online.");
    return null;
  }

  const affected = [...leaveCurrentRooms(fromSocket, fromSocket.id), ...leaveCurrentRooms(toSocket, toSocket.id)];
  for (const game of affected) emitGameStateToRoom(io, game);

  const fromAccount = fromSocket.data?.account;
  const toAccount = toSocket.data?.account;
  const hostName = fromAccount?.username || connectedClients.get(fromSocket.id)?.name || "White";
  const joinName = toAccount?.username || acceptingName || connectedClients.get(toSocket.id)?.name || "Black";
  const game = createRoom(fromSocket, hostName, {
    variant: challenge.variant || "normal",
    timeControl: challenge.timeControl || "rapid",
    ruleLabDifficulty: challenge.ruleLabDifficulty || "medium",
    gameMode: "online",
    publicMatch: false,
    account: participantAccount(fromAccount)
  });
  const joined = joinRoom(toSocket, game.roomCode, joinName, { account: participantAccount(toAccount) });
  if (!joined.ok) {
    toSocket.emit("socialError", joined.reason || "Could not accept challenge.");
    return null;
  }

  updateConnectedClient(fromSocket.id, hostName, game.roomCode, "room");
  updateConnectedClient(toSocket.id, joinName, game.roomCode, "room");
  fromSocket.emit("roomCreated", { roomCode: game.roomCode, color: "white", role: "player", game: sanitiseGameForViewer(game, fromSocket.id) });
  toSocket.emit("roomJoined", { roomCode: game.roomCode, color: "black", role: "player", game: sanitiseGameForViewer(game, toSocket.id) });
  emitGameStateToRoom(io, game);
  emitSocialStateForAccounts([challenge.fromAccountId, challenge.toAccountId]);
  scheduleAIMoveIfNeeded(game);
  return game;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, rooms: rooms.size });
});

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

function getViewerColor(game, socketId) {
  if (game.players?.white?.id === socketId) return "white";
  if (game.players?.black?.id === socketId) return "black";
  return null;
}

function visibleScoobyTraps(game, viewerColor) {
  const traps = game.scooby?.traps || [];
  if (game.scooby?.devReveal) return traps.map((trap) => ({ ...trap, displayType: trap.type, detected: true, viewerOwned: trap.owner === viewerColor, devRevealed: true }));
  if (!viewerColor) return [];
  const own = traps
    .filter((trap) => trap.owner === viewerColor)
    .map((trap) => ({ ...trap, viewerOwned: true, detected: false }));
  const pawns = (game.pieces || []).filter((piece) => piece.color === viewerColor && piece.type === "pawn" && piece.y === 0);
  const detected = [];
  for (const trap of traps) {
    if (trap.owner === viewerColor) continue;
    const detectedByPawn = pawns.some((pawn) => (Math.abs(pawn.x - trap.pos.x) === 1 && pawn.z === trap.pos.z) || (Math.abs(pawn.z - trap.pos.z) === 1 && pawn.x === trap.pos.x));
    if (!detectedByPawn) continue;
    detected.push({
      id: trap.id,
      owner: trap.owner,
      pos: trap.pos ? { ...trap.pos } : null,
      type: trap.type === "decoy" ? trap.apparentType : trap.type,
      displayType: trap.type === "decoy" ? trap.apparentType : trap.type,
      detected: true,
      viewerOwned: false
    });
  }
  return [...own, ...detected];
}

function isInsideScoobySmoke(game, pos) {
  return (game.scooby?.smokes || []).some((smoke) => (Number(game.turnToken) || 0) < (Number(smoke.expiresAtTurn) || 0) && pos.y === 0 && Math.abs(pos.x - smoke.centre.x) <= 2 && Math.abs(pos.z - smoke.centre.z) <= 2);
}


function sanitiseScoobyMoveForViewer(move, viewerColor) {
  if (!move || !move.scooby) return move;
  const copy = {
    ...move,
    from: move.from ? { ...move.from } : null,
    to: move.to ? { ...move.to } : null,
    captured: move.captured ? { ...move.captured } : null
  };
  const isTrapPlacement = typeof copy.scoobyAction === "string" && copy.scoobyAction.startsWith("place ");
  const ownsAction = viewerColor && copy.pieceColor === viewerColor;

  if (isTrapPlacement && !ownsAction) {
    copy.scoobyAction = "place hidden trap";
    copy.trapType = null;
    copy.pieceType = "trap";
    copy.to = null;
  }

  return copy;
}

function sanitiseScoobyHistoryForViewer(copy, viewerColor) {
  if (copy.variant !== "scooby") return;
  copy.moveHistory = (copy.moveHistory || []).map((move) => sanitiseScoobyMoveForViewer(move, viewerColor));
  copy.lastMove = copy.lastMove ? sanitiseScoobyMoveForViewer(copy.lastMove, viewerColor) : null;
  if (copy.lastMove?.scooby && String(copy.lastMove.scoobyAction || "").startsWith("place hidden trap")) {
    copy.message = `${copy.lastMove.pieceColor} placed a hidden trap.`;
  }
}

function sanitiseGameForViewer(game, socketId) {
  const copy = cloneGame(game);
  const viewerColor = getViewerColor(game, socketId);
  attachPublicPlayerRatings(copy);
  if (copy.variant === "predict" && copy.predict) {
    const visiblePending = (entry, entryColor) => {
      if (!entry) return null;
      if (viewerColor === entryColor) {
        return {
          locked: true,
          pieceId: entry.pieceId,
          to: entry.to ? { ...entry.to } : null
        };
      }
      return { locked: true };
    };
    copy.predict = {
      round: copy.predict.round || 1,
      pending: {
        white: visiblePending(copy.predict.pending?.white, "white"),
        black: visiblePending(copy.predict.pending?.black, "black")
      }
    };
  }
  if (copy.variant === "ruleLab" && copy.ruleLab) {
    copy.ruleLab = {
      difficulty: copy.ruleLab.difficulty,
      ruleTarget: copy.ruleLab.ruleTarget || (copy.ruleLab.hiddenRules || []).length,
      endsAt: copy.ruleLab.endsAt,
      discovered: [...(copy.ruleLab.discovered || [])],
      clues: (copy.ruleLab.clues || []).map((clue) => clue.revealed ? clue : { id: clue.id, revealed: false }),
      anomalyLog: copy.ruleLab.anomalyLog || [],
      guesses: copy.ruleLab.guesses || [],
      availableGuesses: copy.ruleLab.availableGuesses || []
    };
  }
  if (copy.variant === "scooby" && copy.scooby) {    copy.scooby.traps = visibleScoobyTraps(game, viewerColor);
    copy.pieces = copy.pieces.filter((piece) => !isInsideScoobySmoke(game, piece));
    sanitiseScoobyHistoryForViewer(copy, viewerColor);
  }
  return copy;
}

function attachPublicPlayerRatings(game) {
  if (!game?.players) return;
  const rankedEntries = getLeaderboard(game.variant || "normal", "month", 1000).entries || [];
  for (const color of ["white", "black"]) {
    const player = game.players[color];
    if (!player?.accountId) continue;
    player.elo = getElo(player.accountId, game.variant || "normal", "month");
    const rankIndex = rankedEntries.findIndex((entry) => entry.accountId === player.accountId);
    player.rank = rankIndex >= 0 ? rankIndex + 1 : null;
  }
}

function captureReportSnapshot(game) {
  if (!game?.roomCode) return;

  const moveCount = game.moveHistory?.length || 0;
  const chatCount = game.chat?.length || 0;
  const status = game.status || "unknown";
  const key = `${moveCount}:${chatCount}:${game.turn || ""}:${status}:${game.winner || ""}:${game.message || ""}`;
  const now = Date.now();

  // emitGameStateToRoom can run several times for the same visible state. Keep one
  // report snapshot per meaningful state unless a few seconds have passed.
  if (game._lastReportSnapshotKey === key && now - (game._lastReportSnapshotAt || 0) < 5000) return;

  game._lastReportSnapshotKey = key;
  game._lastReportSnapshotAt = now;

  if (!Array.isArray(game.reportSnapshots)) game.reportSnapshots = [];
  game.reportSnapshots.push({
    at: now,
    roomCode: game.roomCode,
    variant: game.variant,
    variantName: game.variantName,
    timeControl: game.timeControl,
    status,
    turn: game.turn,
    winner: game.winner || null,
    check: Boolean(game.check),
    moveCount,
    chatCount,
    message: game.message || "",
    clocks: game.clocks ? JSON.parse(JSON.stringify(game.clocks)) : null,
    lastMove: game.lastMove ? JSON.parse(JSON.stringify(game.lastMove)) : null,
    players: {
      white: game.players?.white ? {
        name: game.players.white.name,
        accountId: game.players.white.accountId || null,
        accountName: game.players.white.accountName || null,
        guest: !game.players.white.accountId
      } : null,
      black: game.players?.black ? {
        name: game.players.black.name,
        accountId: game.players.black.accountId || null,
        accountName: game.players.black.accountName || null,
        guest: !game.players.black.accountId
      } : null
    },
    pieces: (game.pieces || []).map((piece) => ({
      id: piece.id,
      type: piece.type,
      color: piece.color,
      owner: piece.owner || null,
      x: piece.x,
      y: piece.y,
      z: piece.z
    }))
  });

  game.reportSnapshots = game.reportSnapshots.slice(-80);
}

function emitGameStateToSocket(socket, game) {
  const payload = sanitiseGameForViewer(game, socket.id);
  recordOutgoing("gameState", payload, game?.roomCode, 1);
  socket.emit("gameState", payload);
}

function emitGameStateToRoom(io, game) {
  if (!game) return;
  captureReportSnapshot(game);
  recordCompletedGameForAccounts(game);
  recordLeaderboardGame(game);
  const targets = new Set([game.players?.white?.id, game.players?.black?.id, ...(game.spectators || []).map((spectator) => spectator.id)].filter(Boolean));
  for (const socketId of targets) {
    const targetSocket = io.sockets.sockets.get(socketId);
    if (targetSocket) emitGameStateToSocket(targetSocket, game);
  }
}


io.on("connection", (socket) => {
  connectedClients.set(socket.id, { id: socket.id, name: "Guest", connectedAt: Date.now(), lastRoomCode: null, accountId: null, accountName: null });
  socket.emit("aiAvailability", getAIAvailabilityPayload());
  recordOutgoing("aiAvailability", getAIAvailabilityPayload(), "GLOBAL", 1);
  emitSiteSettings(socket);
  emitProfileIcons(socket);
  emitBadgeCatalog(socket);
  socket.onAny((eventName, payload = {}) => {
    recordIncoming(eventName, payload, payload?.roomCode || connectedClients.get(socket.id)?.lastRoomCode || "GLOBAL");
  });

  socket.on("requestAIAvailability", () => {
    const payload = getAIAvailabilityPayload();
    recordOutgoing("aiAvailability", payload, "GLOBAL", 1);
    socket.emit("aiAvailability", payload);
  });

  socket.on("requestProfileIcons", () => emitProfileIcons(socket));
  socket.on("requestBadgeCatalog", () => emitBadgeCatalog(socket));
  socket.on("requestSiteSettings", () => emitSiteSettings(socket));

  socket.on("identifyDevice", ({ deviceId } = {}) => {
    socket.data.deviceId = normaliseDeviceId(deviceId);
    sendPunishmentNotice(socket);
  });

  socket.on("accountCreate", ({ email, username, password } = {}) => {
    const result = createAccount({ email, username, password });
    if (!result.ok) {
      socket.emit("accountError", result.reason || "Could not create account.");
      return;
    }
    socket.data.account = getAccountByToken(result.token);
    updateConnectedClient(socket.id, result.account.username, connectedClients.get(socket.id)?.lastRoomCode || null);
    socket.emit("accountAuthenticated", { account: result.account, token: result.token });
    sendPunishmentNotice(socket);
  });

  socket.on("accountLogin", ({ login, password } = {}) => {
    const result = loginAccount({ login, password });
    if (!result.ok) {
      socket.emit("accountError", result.reason || "Could not log in.");
      return;
    }
    socket.data.account = getAccountByToken(result.token);
    updateConnectedClient(socket.id, result.account.username, connectedClients.get(socket.id)?.lastRoomCode || null);
    socket.emit("accountAuthenticated", { account: result.account, token: result.token });
    sendPunishmentNotice(socket);
  });

  socket.on("accountSession", ({ token } = {}) => {
    const account = getPublicAccountByToken(token);
    if (!account) {
      socket.emit("accountSessionExpired");
      return;
    }
    socket.data.account = getAccountByToken(token);
    updateConnectedClient(socket.id, account.username, connectedClients.get(socket.id)?.lastRoomCode || null);
    socket.emit("accountAuthenticated", { account, token });
    sendPunishmentNotice(socket);
  });

  socket.on("accountUpdate", ({ token, updates } = {}) => {
    const result = updateAccount(token, updates || {});
    if (!result.ok) {
      socket.emit("accountError", result.reason || "Could not update account.");
      return;
    }
    socket.data.account = getAccountByToken(token);
    updateConnectedClient(socket.id, result.account.username, connectedClients.get(socket.id)?.lastRoomCode || null);
    const affected = refreshAccountParticipantInRooms(socket.id, result.account);
    socket.emit("accountUpdated", { account: result.account });
    socket.emit("accountAuthenticated", { account: result.account, token });
    sendPunishmentNotice(socket);
    for (const game of affected) emitGameStateToRoom(io, game);
  });

  socket.on("accountLogout", ({ token } = {}) => {
    logoutAccount(token);
    socket.data.account = null;
    updateConnectedClient(socket.id, "Guest", connectedClients.get(socket.id)?.lastRoomCode || null);
    socket.emit("accountLoggedOut");
  });

  socket.on("createRoom", ({ name, variant, timeControl, gameMode, aiDifficulty, ruleLabDifficulty } = {}) => {
    updateConnectedClient(socket.id, name, null);
    const ban = getBlockingPunishment(socket, "ban");
    if (ban) { socket.emit("joinError", punishmentBlockedMessage(ban)); sendPunishmentNotice(socket); return; }
    if (guestNameBlocked(socket, name)) {
      socket.emit("joinError", "That name belongs to an account. Sign in or choose another guest name.");
      return;
    }
    if (gameMode === "ai" && !isAIDifficultyEnabled(aiDifficulty, variant)) {
      socket.emit("joinError", `${capitalise(normaliseDevDifficulty(aiDifficulty))} AI is currently disabled by the server.`);
      return;
    }
    const game = createRoom(socket, name, { variant, timeControl, gameMode, aiDifficulty, ruleLabDifficulty, account: participantAccount(socket.data.account) });
    updateConnectedClient(socket.id, name, game.roomCode);
    socket.emit("roomCreated", { roomCode: game.roomCode, color: "white", role: "player", game: sanitiseGameForViewer(game, socket.id) });
    emitGameStateToRoom(io, game);
    scheduleAIMoveIfNeeded(game);
  });

  socket.on("joinRoom", ({ roomCode, name } = {}) => {
    updateConnectedClient(socket.id, name, roomCode);
    const ban = getBlockingPunishment(socket, "ban");
    if (ban) { socket.emit("joinError", punishmentBlockedMessage(ban)); sendPunishmentNotice(socket); return; }
    if (guestNameBlocked(socket, name)) {
      socket.emit("joinError", "That name belongs to an account. Sign in or choose another guest name.");
      return;
    }
    const result = joinRoom(socket, roomCode, name, { account: participantAccount(socket.data.account) });
    if (!result.ok) {
      socket.emit("joinError", result.reason);
      return;
    }

    updateConnectedClient(socket.id, name, result.game.roomCode);
    socket.emit("roomJoined", { roomCode: result.game.roomCode, color: result.color, role: result.role, game: sanitiseGameForViewer(result.game, socket.id) });
    emitGameStateToRoom(io, result.game);
    scheduleAIMoveIfNeeded(result.game);
  });


  socket.on("quickMatch", ({ name, variant, timeControl, scope, ruleLabDifficulty } = {}) => {
    updateConnectedClient(socket.id, name, null);
    const ban = getBlockingPunishment(socket, "ban");
    if (ban) { socket.emit("matchmakingError", punishmentBlockedMessage(ban)); sendPunishmentNotice(socket); return; }
    if (guestNameBlocked(socket, name)) {
      socket.emit("matchmakingError", "That name belongs to an account. Sign in or choose another guest name.");
      return;
    }
    const result = quickMatch(socket, name, { variant, timeControl, scope, ruleLabDifficulty, account: participantAccount(socket.data.account) });
    if (!result.ok) {
      socket.emit("matchmakingError", result.reason || "Quick match failed.");
      return;
    }

    if (result.created && !result.matched) {
      updateConnectedClient(socket.id, name, null);
      socket.emit("matchmakingStatus", {
        searching: true,
        matched: false,
        roomCode: result.roomCode || result.game.roomCode,
        scope: result.scope
      });
      return;
    }

    updateConnectedClient(socket.id, name, result.roomCode || result.game.roomCode);
    socket.emit("roomJoined", {
      roomCode: result.roomCode || result.game.roomCode,
      color: result.color,
      role: result.role,
      game: sanitiseGameForViewer(result.game, socket.id)
    });
    socket.emit("matchmakingStatus", {
      searching: false,
      matched: result.matched,
      roomCode: result.roomCode || result.game.roomCode,
      scope: result.scope,
      match: result.matched ? makeMatchFoundPayload(result.game, socket.id) : null
    });

    if (result.matchedSocketId) {
      const hostSocket = io.sockets.sockets.get(result.matchedSocketId);
      if (hostSocket) {
        updateConnectedClient(result.matchedSocketId, connectedClients.get(result.matchedSocketId)?.name || result.game.players.white?.name || "White", result.game.roomCode);
        hostSocket.emit("roomJoined", {
          roomCode: result.game.roomCode,
          color: "white",
          role: "player",
          game: sanitiseGameForViewer(result.game, result.matchedSocketId)
        });
        hostSocket.emit("matchmakingStatus", { searching: false, matched: true, roomCode: result.game.roomCode, scope: result.scope, match: makeMatchFoundPayload(result.game, result.matchedSocketId) });
      }
    }

    emitGameStateToRoom(io, result.game);
    scheduleAIMoveIfNeeded(result.game);
  });

  socket.on("cancelQuickMatch", () => {
    const result = cancelQuickMatch(socket.id);
    if (result.roomCode) socket.leave(result.roomCode);
    updateConnectedClient(socket.id, connectedClients.get(socket.id)?.name || "Guest", null);
    socket.emit("matchmakingStatus", { searching: false, cancelled: result.ok });
  });

  socket.on("clientPresence", ({ name, state, roomCode } = {}) => {
    const lobbyState = String(state || "").toLowerCase() === "lobby";
    updateConnectedClient(socket.id, name, lobbyState ? null : roomCode, lobbyState ? "lobby" : "room");
  });

  socket.on("selectPiece", ({ roomCode, pieceId } = {}) => {
    const result = getLegalMovesForSocket(socket.id, roomCode, pieceId);
    if (!result.ok) {
      socket.emit("legalMoves", { pieceId, legalMoves: [], reason: result.reason });
      return;
    }
    if (result.game) emitGameStateToRoom(io, result.game);
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
      recordIllegalMoveAttempt(game, socket, result.reason);
      socket.emit("invalidMove", result.reason);
      return;
    }
    markFirstMoveAndMaybeStartTimer(game);

    emitGameStateToRoom(io, game);
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
      recordIllegalMoveAttempt(game, socket, result.reason);
      socket.emit("invalidMove", result.reason);
      return;
    }
    markFirstMoveAndMaybeStartTimer(game);

    emitGameStateToRoom(io, game);
    scheduleAIMoveIfNeeded(game);
  });



  socket.on("attemptNukeLaunch", ({ roomCode, to } = {}) => {
    const game = rooms.get(String(roomCode ?? "").trim().toUpperCase());
    if (!game) {
      socket.emit("invalidMove", "Room not found.");
      return;
    }

    tickGameClock(game);
    const result = attemptLaunchNuke(game, socket.id, to, {
      devOverride: hasDeveloperMoveOverride(socket.id, game.roomCode)
    });
    if (!result.ok) {
      recordIllegalMoveAttempt(game, socket, result.reason);
      socket.emit("invalidMove", result.reason);
      return;
    }
    markFirstMoveAndMaybeStartTimer(game);

    emitGameStateToRoom(io, game);
    scheduleAIMoveIfNeeded(game);
  });

  socket.on("attemptTycoonAction", ({ roomCode, action, to } = {}) => {
    const game = rooms.get(String(roomCode ?? "").trim().toUpperCase());
    if (!game) {
      socket.emit("invalidMove", "Room not found.");
      return;
    }

    tickGameClock(game);
    const result = attemptTycoonAction(game, socket.id, action, to, {
      devOverride: hasDeveloperMoveOverride(socket.id, game.roomCode)
    });
    if (!result.ok) {
      recordIllegalMoveAttempt(game, socket, result.reason);
      socket.emit("invalidMove", result.reason);
      return;
    }
    markFirstMoveAndMaybeStartTimer(game);

    emitGameStateToRoom(io, game);
    scheduleAIMoveIfNeeded(game);
  });

  socket.on("attemptScoobyAction", ({ roomCode, action, to } = {}) => {
    const game = rooms.get(String(roomCode ?? "").trim().toUpperCase());
    if (!game) {
      socket.emit("invalidMove", "Room not found.");
      return;
    }

    tickGameClock(game);
    const result = attemptScoobyAction(game, socket.id, action, to, {
      devOverride: hasDeveloperMoveOverride(socket.id, game.roomCode)
    });
    if (!result.ok) {
      recordIllegalMoveAttempt(game, socket, result.reason);
      socket.emit("invalidMove", result.reason);
      return;
    }
    markFirstMoveAndMaybeStartTimer(game);

    emitGameStateToRoom(io, game);
    scheduleAIMoveIfNeeded(game);
  });


  socket.on("forfeitGame", ({ roomCode } = {}) => {
    const result = forfeitGame(socket.id, roomCode);
    if (!result.ok) {
      socket.emit("invalidMove", result.reason);
      return;
    }
    emitGameStateToRoom(io, result.game);
  });

  socket.on("requestRematch", ({ roomCode } = {}) => {
    const code = String(roomCode || "").trim().toUpperCase();
    const game = rooms.get(code);
    if (!game) { socket.emit("invalidMove", "Room not found."); return; }
    const color = game.players?.white?.id === socket.id ? "white" : game.players?.black?.id === socket.id ? "black" : null;
    if (!color) { socket.emit("invalidMove", "Only players can request a rematch."); return; }
    if (!(game.status === "finished" || game.status === "abandoned")) { socket.emit("invalidMove", "Rematch is available after the game ends."); return; }
    if (!game.rematchRequests) game.rematchRequests = {};
    game.rematchRequests[color] = true;
    game.message = `${capitalise(color)} requested a rematch.`;
    if (game.rematchRequests.white && game.rematchRequests.black) {
      const utility = runDevUtilityCommand(code, "resetMatch", [], socket.id, "Rematch");
      if (!utility?.ok) { socket.emit("invalidMove", utility?.reason || "Could not start rematch."); return; }
      game.rematchRequests = {};
      game.message = "Rematch started.";
    }
    emitGameStateToRoom(io, game);
    scheduleAIMoveIfNeeded(game);
  });

  socket.on("sendChatMessage", ({ roomCode, body } = {}) => {
    const game = rooms.get(String(roomCode ?? "").trim().toUpperCase());
    const text = String(body || "").trim();
    if (text.toLowerCase().startsWith("!report")) {
      const report = createReport({ game, reporterSocket: socket, reason: text.replace(/^!report\s*/i, "") });
      if (!report.ok) socket.emit("chatError", report.reason);
      else socket.emit("chatError", `Report ${report.report.id} recorded as ${report.report.evidence.strength} evidence.`);
      return;
    }
    if (text.toLowerCase().startsWith("!friend")) {
      const opponent = game ? opponentAccountForSocket(game, socket.id) : null;
      const target = text.replace(/^!friend\s*/i, "").trim() || opponent?.accountName || opponent?.name || "";
      handleFriendRequestCommand(socket, target);
      return;
    }
    if (text.toLowerCase().startsWith("!accept")) {
      const from = text.replace(/^!accept\s*/i, "").trim();
      handleFriendAcceptCommand(socket, from);
      return;
    }
    const mute = getBlockingPunishment(socket, "mute");
    if (mute) { socket.emit("chatError", punishmentBlockedMessage(mute)); sendPunishmentNotice(socket); return; }
    const result = appendChatMessage(socket.id, roomCode, body);
    if (!result.ok) {
      socket.emit("chatError", result.reason);
      return;
    }
    emitGameStateToRoom(io, result.game);
  });

  socket.on("requestSocialState", ({ token } = {}) => {
    const account = getAccountByToken(token) || socket.data.account;
    if (!account) return;
    emitSocialStateToSocket(socket);
  });

  socket.on("friendRequest", ({ token, target } = {}) => {
    const account = getAccountByToken(token) || socket.data.account;
    if (!account) { socket.emit("socialError", "Log in first."); return; }
    const result = sendFriendRequest(account.id, target);
    if (!result.ok) socket.emit("socialError", result.reason);
    else {
      socket.emit("socialNotice", `Friend request sent to ${result.targetAccount.username}.`);
      emitSocialStateForAccounts([account.id, result.targetAccount.id]);
    }
  });

  socket.on("friendRespond", ({ token, requestId, accept } = {}) => {
    const account = getAccountByToken(token) || socket.data.account;
    if (!account) { socket.emit("socialError", "Log in first."); return; }
    const result = respondFriendRequest(account.id, requestId, Boolean(accept));
    if (!result.ok) socket.emit("socialError", result.reason);
    else emitSocialStateForAccounts([result.request.fromAccountId, result.request.toAccountId]);
  });

  socket.on("friendMessage", ({ token, toAccountId, body } = {}) => {
    const account = getAccountByToken(token) || socket.data.account;
    if (!account) { socket.emit("socialError", "Log in first."); return; }
    const result = sendFriendMessage(account.id, toAccountId, body);
    if (!result.ok) socket.emit("socialError", result.reason);
    else emitSocialStateForAccounts([account.id, toAccountId]);
  });

  socket.on("friendChallenge", ({ token, target, variant, timeControl, ruleLabDifficulty } = {}) => {
    const account = getAccountByToken(token) || socket.data.account;
    if (!account) { socket.emit("socialError", "Log in first."); return; }
    const result = createChallenge(account.id, target, { variant, timeControl, ruleLabDifficulty });
    if (!result.ok) socket.emit("socialError", result.reason);
    else {
      emitSocialStateForAccounts([account.id, result.targetAccount.id]);
      notifyChallenge(result.challenge);
    }
  });

  socket.on("friendChallengeRespond", ({ token, challengeId, accept, name } = {}) => {
    const account = getAccountByToken(token) || socket.data.account;
    if (!account) { socket.emit("socialError", "Log in first."); return; }
    const result = respondChallenge(account.id, challengeId, Boolean(accept));
    if (!result.ok) { socket.emit("socialError", result.reason); return; }
    emitSocialStateForAccounts([result.challenge.fromAccountId, result.challenge.toAccountId]);
    if (accept) startAcceptedChallenge(socket, result.challenge, name || account.username);
  });


  socket.on("ruleLabGuess", ({ roomCode, guessId, guess } = {}) => {
    const game = rooms.get(String(roomCode || "").toUpperCase());
    if (!game) { socket.emit("chatError", "Rule Lab room not found."); return; }
    const result = submitRuleLabGuess(game, socket.data.account?.id || socket.id, guess || guessId);
    if (!result.ok) socket.emit("chatError", result.reason);
    else {
      socket.emit("chatError", result.message);
      emitGameStateToRoom(io, game);
      scheduleAIMoveIfNeeded(game);
    }
  });

  socket.on("requestLeaderboard", ({ variant = "normal", scope = "month" } = {}) => {
    const payload = getLeaderboard(variant, scope, 100);
    socket.emit("leaderboardData", payload);
  });

  socket.on("requestPublicProfile", ({ query } = {}) => {
    const result = publicProfile(query, socket.data.account?.id || null);
    if (!result.ok) socket.emit("profileError", result.reason);
    else socket.emit("publicProfile", result.profile);
  });

  socket.on("punishmentAppeal", ({ punishmentId, text } = {}) => {
    const identity = socketIdentity(socket);
    const result = submitAppeal({ punishmentId, identity, text });
    if (!result.ok) socket.emit("appealError", result.reason);
    else socket.emit("appealSubmitted", { appeal: result.appeal });
  });

  socket.on("devNetworkMetrics", (payload = {}) => {
    if (!devAuthenticatedSockets.has(socket.id)) return;
    const roomCode = payload.roomCode ? String(payload.roomCode).toUpperCase() : null;
    const metrics = getNetworkMetricsPayload({ scope: payload.scope || "overall", roomCode });
    recordOutgoing("networkMetrics", metrics, roomCode || "GLOBAL", 1);
    socket.emit("networkMetrics", metrics);
  });


  socket.on("devCommand", (payload = {}) => {
    const result = handleDevCommand(socket, payload);
    if (result?.gameStateRoom) {
      emitGameStateToRoom(io, rooms.get(result.gameStateRoom));
    }
    if (Array.isArray(result?.affectedRooms)) {
      for (const roomCode of result.affectedRooms) {
        const game = rooms.get(roomCode);
        if (game) emitGameStateToRoom(io, game);
      }
    }
    socket.emit("devCommandResult", result?.response || { ok: false, lines: ["Command failed."] });
    if (result?.roomEvent === "roomCreated") socket.emit("roomCreated", result.roomPayload);
    if (result?.roomEvent === "roomJoined") socket.emit("roomJoined", result.roomPayload);
    if (result?.shoutRoomCode && result?.shoutPayload) {
      io.to(result.shoutRoomCode).emit("shoutMessage", result.shoutPayload);
    }
    if (Array.isArray(result?.forcedVisualTargets) && result?.forcedVisualPayload) {
      for (const targetId of result.forcedVisualTargets) {
        recordOutgoing("devForcedVisual", result.forcedVisualPayload, "GLOBAL", 1);
        io.to(targetId).emit("devForcedVisual", result.forcedVisualPayload);
      }
    }
    if (result?.aiAvailability) {
      io.emit("aiAvailability", result.aiAvailability);
      recordOutgoing("aiAvailability", result.aiAvailability, "GLOBAL", io.sockets.sockets.size);
    }
    if (result?.siteSettings) {
      io.emit("siteSettings", result.siteSettings);
      recordOutgoing("siteSettings", result.siteSettings, "GLOBAL", io.sockets.sockets.size);
    }
    if (Array.isArray(result?.closedRoomTargets) && result?.closedRoomPayload) {
      const roomCode = result.closedRoomCode;
      for (const targetId of result.closedRoomTargets) {
        const targetSocket = io.sockets.sockets.get(targetId);
        if (targetSocket) {
          recordOutgoing("devRoomClosed", result.closedRoomPayload, roomCode, 1);
          targetSocket.emit("devRoomClosed", result.closedRoomPayload);
          targetSocket.leave(roomCode);
          updateConnectedClient(targetId, connectedClients.get(targetId)?.name || "Guest", null);
        }
      }
      if (roomCode) {
        const pendingTimer = pendingAITimers.get(roomCode);
        if (pendingTimer) clearTimeout(pendingTimer);
        pendingAITimers.delete(roomCode);
        rooms.delete(roomCode);
      }
    }
    if (result?.scheduleRoomCode) {
      const game = rooms.get(result.scheduleRoomCode);
      if (game) {
        emitGameStateToRoom(io, game);
        scheduleAIMoveIfNeeded(game);
      }
    }
  });

  socket.on("disconnect", () => {
    devAuthenticatedSockets.delete(socket.id);
    connectedClients.delete(socket.id);
    const affectedGames = removeSocketFromRooms(socket.id);
    for (const game of affectedGames) {
      emitGameStateToRoom(io, game);
    }
  });
});


function handleDevCommand(socket, payload = {}) {
  let action = String(payload.action || "").trim();

  if (action === "devUnlock") {
    if (accountHasConsoleAccess(socket.data?.account)) {
      devAuthenticatedSockets.add(socket.id);
      return { response: { ok: true, unlocked: true, lines: ["developer console unlocked by account rank."] } };
    }
    if (verifyDevPassword(payload.password)) {
      devAuthenticatedSockets.add(socket.id);
      return { response: { ok: true, unlocked: true, lines: ["developer console unlocked."] } };
    }
    return { response: { ok: false, lines: [] } };
  }

  if (!devAuthenticatedSockets.has(socket.id) && !accountHasConsoleAccess(socket.data?.account)) {
    return { response: { ok: false, lines: [] } };
  }
  let args = Array.isArray(payload.args) ? payload.args : [];
  const routed = routeStructuredDevCommand(action, args);
  action = routed.action;
  args = routed.args;
  const name = String(payload.name || "").trim() || "Developer";
  const currentRoomCode = String(payload.currentRoomCode || "").trim().toUpperCase();
  updateConnectedClient(socket.id, name, currentRoomCode || connectedClients.get(socket.id)?.lastRoomCode || null);
  const selectedVariant = normaliseDevVariant(payload.selectedVariant || args[0] || "threeD");
  const selectedTimeControl = normaliseDevTimeControl(payload.selectedTimeControl || "rapid");
  const selectedDifficulty = normaliseDevDifficulty(payload.selectedAIDifficulty || "medium");

  if (action === "forceFx" || action === "forceCosmetic") {
    const target = String(args[0] || "room").trim();
    const effectArgs = args.slice(1);
    if (!target || !effectArgs.length) {
      return { response: { ok: false, lines: [`Usage: ${action === "forceFx" ? "fx force" : "cosmetic force"} [target] [command args...]`] } };
    }
    const targetIds = resolveForcedVisualTargets(target, currentRoomCode, socket.id);
    if (!targetIds.length) return { response: { ok: false, lines: [`No target matched: ${target}`] } };
    return {
      response: {
        ok: true,
        lines: [`Forced ${action === "forceFx" ? "fx" : "cosmetic"} on ${targetIds.length} client(s): ${target}`, `${effectArgs.join(" ")}`]
      },
      forcedVisualTargets: targetIds,
      forcedVisualPayload: {
        kind: action === "forceFx" ? "fx" : "cosmetic",
        args: effectArgs,
        from: name,
        target
      }
    };
  }

  if (action === "closeRoom") {
    const parsed = parseCloseRoomArgs(args, currentRoomCode);
    if (!parsed.roomCode) return { response: { ok: false, lines: ["Usage: room close [code=current] [reason]"] } };
    const game = rooms.get(parsed.roomCode);
    if (!game) return { response: { ok: false, lines: [`Room not found: ${parsed.roomCode}`] } };
    const targetIds = getRoomSocketIds(game);
    const message = parsed.reason ? `Your room was closed for ${parsed.reason}.` : "Your room was closed.";
    return {
      response: { ok: true, lines: [`Closed room ${parsed.roomCode}.`, message] },
      closedRoomCode: parsed.roomCode,
      closedRoomTargets: targetIds,
      closedRoomPayload: { reason: message, roomCode: parsed.roomCode }
    };
  }

  if (action === "siteCommand") {
    const area = String(args[0] || "status").toLowerCase();
    const sub = String(args[1] || "status").toLowerCase();

    if (!["support", "stripe", "donations", "donate"].includes(area)) {
      return { response: { ok: false, lines: ["Usage: support status|enable|disable OR site support status|enable|disable"] } };
    }

    if (["status", "list", "state", "show"].includes(sub)) {
      return {
        response: {
          ok: true,
          lines: [
            `Support/Stripe UI: ${siteSettings.supportUiEnabled !== false ? "enabled" : "disabled"}.`,
            "Commands: support enable | support disable | support status",
            "Alias: site support enable|disable|status"
          ]
        },
        siteSettings: getPublicSiteSettings()
      };
    }

    if (["enable", "enabled", "on", "show", "visible"].includes(sub)) {
      const settings = setSupportUiEnabled(true);
      return { response: { ok: true, lines: ["Support/Stripe UI enabled on the home page."] }, siteSettings: settings };
    }

    if (["disable", "disabled", "off", "hide", "hidden"].includes(sub)) {
      const settings = setSupportUiEnabled(false);
      return { response: { ok: true, lines: ["Support/Stripe UI disabled on the home page."] }, siteSettings: settings };
    }

    return { response: { ok: false, lines: ["Usage: support status|enable|disable OR site support status|enable|disable"] } };
  }

  if (action === "aiAvailability") {
    const sub = String(args[0] || "status").toLowerCase();
    if (sub === "status" || sub === "list" || sub === "availability") {
      const variant = args[1] && String(args[1]).toLowerCase() !== "all" ? normaliseDevVariant(args[1]) : null;
      const availability = getAIAvailabilityPayload(variant);
      const lines = [
        `AI availability${variant ? ` for ${variant}` : ""}:`,
        ...["easy", "medium", "hard"].map((difficulty) => `${difficulty}: ${availability[difficulty] !== false ? "enabled" : "disabled"}`),
        `Global: easy=${availability.all.easy !== false}, medium=${availability.all.medium !== false}, hard=${availability.all.hard !== false}`,
        ...Object.entries(availability.variants || {}).map(([mode, modes]) => `${mode}: ${["easy","medium","hard"].map((difficulty)=>`${difficulty}=${modes[difficulty] === undefined ? "inherit" : modes[difficulty] !== false}`).join(" ")}`)
      ];
      return { response: { ok: true, lines } };
    }
    if (["enable", "disable"].includes(sub)) {
      const difficulty = normaliseDevDifficulty(args[1]);
      const variant = args[2] || "all";
      const availability = setAIDifficultyAvailability(difficulty, sub === "enable", variant);
      const label = String(variant).toLowerCase() === "all" ? "all variants" : getVariantLabelServer(normaliseDevVariant(variant));
      return {
        response: { ok: true, lines: [`${capitalise(difficulty)} AI ${sub === "enable" ? "enabled" : "disabled"} for ${label}.`] },
        aiAvailability: availability
      };
    }
    return { response: { ok: false, lines: ["Usage: ai enable|disable [easy|medium|hard] [variant|all] OR ai availability [variant]"] } };
  }

  if (action === "accountCommand") {
    const sub = String(args[0] || "info").toLowerCase();
    if (["info", "view", "show"].includes(sub)) {
      const query = args.slice(1).join(" ") || name;
      const result = getAccountInfoLines(query);
      return { response: { ok: result.ok, lines: result.lines } };
    }
    if (["list", "recent"].includes(sub)) {
      return { response: { ok: true, lines: getAccountListLines(args[1]) } };
    }
    if (["online", "where", "locate", "presence"].includes(sub)) {
      const result = accountPresenceLines(args.slice(1).join(" ") || name);
      return { response: { ok: result.ok, lines: result.lines } };
    }
    if (["create", "make"].includes(sub)) {
      const [email, username, password] = args.slice(1);
      if (!email || !username || !password) return { response: { ok: false, lines: ["Usage: account create [email] [username] [password]"] } };
      const result = devCreateAccount({ email, username, password });
      return { response: { ok: result.ok, lines: [result.ok ? `Created account ${result.account.username}.` : result.reason] } };
    }
    if (["remove", "delete"].includes(sub)) {
      const query = args.slice(1).join(" ");
      if (!query) return { response: { ok: false, lines: ["Usage: account remove [username|email|id]"] } };
      const result = deleteAccount(query);
      return { response: { ok: result.ok, lines: [result.ok ? `Removed account ${result.account.username}.` : result.reason] } };
    }
    if (["icon", "profileicon"].includes(sub)) {
      const query = args[1];
      const icon = args[2];
      if (!query || !icon) return { response: { ok: false, lines: ["Usage: account icon [username|email|id] [icon-file]"] } };
      const result = forceProfileIcon(query, icon);
      return { response: { ok: result.ok, lines: [result.ok ? `Set ${result.account.username} icon to ${result.account.profile?.icon}.` : result.reason] } };
    }
    if (["wipe", "resetdata", "reset"].includes(sub)) {
      const query = args[1];
      const mode = args[2] || "game";
      if (!query) return { response: { ok: false, lines: ["Usage: account wipe [username|email|id] [game|all]"] } };
      const result = wipeAccountData(query, mode);
      if (!result.ok) return { response: { ok: false, lines: [result.reason] } };
      const cleared = clearLeaderboardForAccount(result.accountId);
      return { response: { ok: true, lines: [`Wiped ${result.account.username} ${result.mode} data. Cleared ${cleared} leaderboard entries.`] } };
    }
    if (sub === "store") {
      return { response: { ok: true, lines: [`Account store: ${accountStorePath()}`, `Profile icons: ${getProfileIconList().join(", ")}`] } };
    }
    return { response: { ok: false, lines: ["Usage: account info|list|online|create|remove|icon|wipe|store ..."] } };
  }

  if (action === "networkCommand") {
    const sub = String(args[0] || "summary").toLowerCase();
    let roomCode = null;
    if (sub === "room") roomCode = String(args[1] || "").trim().toUpperCase();
    if (sub === "dashboard" && args[1] && args[1] !== "overall" && args[1] !== "all") roomCode = String(args[1]).trim().toUpperCase();
    if (sub === "ai" && args[1] && args[1] !== "all") roomCode = String(args[1]).trim().toUpperCase();
    const metrics = getNetworkMetricsPayload({ scope: roomCode ? "room" : "overall", roomCode });
    const lines = networkSummaryLines(metrics);
    if (sub === "dashboard") {
      return {
        response: {
          ok: true,
          lines: [`Opening network dashboard${roomCode ? ` for ${roomCode}` : " for overall server"}.`],
          networkDashboard: { scope: roomCode ? "room" : "overall", roomCode }
        }
      };
    }
    if (sub === "rooms") {
      return {
        response: {
          ok: true,
          lines: Array.from(rooms.values()).map((game) => {
            const stat = getRoomNetworkStats(game.roomCode);
            return `${game.roomCode} | ${game.variant} | ${game.status} | mem ${formatBytes(approximateRoomMemoryBytes(game))} | sent ${formatBytes(stat.sentBytes)} | recv ${formatBytes(stat.receivedBytes)} | AI ${stat.aiMoves} move(s), ${stat.aiMs.toFixed(1)} ms`;
          })
        }
      };
    }
    if (sub === "server" || sub === "summary" || sub === "room" || sub === "ai" || sub === "overall") {
      return { response: { ok: true, lines } };
    }
    return { response: { ok: false, lines: ["Usage: network summary | network server | network rooms | network room [code] | network ai [code|all] | network dashboard [overall|code]"] } };
  }

  if (action === "findOpenMatches") {
    const matches = getOpenMatches();
    if (!matches.length) return { response: { ok: true, lines: ["No open matches found."] } };
    return {
      response: {
        ok: true,
        lines: matches.map((match) => `${match.roomCode} | ${match.visibility} | ${match.variantName} | ${match.status} | ${match.white || "open"} vs ${match.black || "open"} | spectators ${match.spectators} | moves ${match.moveCount}`)
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
    const result = spectateRoom(socket, roomCode, name, { account: participantAccount(socket.data.account) });
    if (!result.ok) return { response: { ok: false, lines: [result.reason] } };
    return {
      response: { ok: true, lines: [`Spectating ${result.game.roomCode}.`] },
      roomEvent: "roomJoined",
      roomPayload: { roomCode: result.game.roomCode, color: result.color, role: result.role, game: sanitiseGameForViewer(result.game, socket.id) },
      gameStateRoom: result.game.roomCode,
      affectedRooms: affected.map((game) => game.roomCode),
      scheduleRoomCode: result.game.roomCode
    };
  }

  if (action === "joinCode") {
    const roomCode = String(args[0] || "").trim().toUpperCase();
    if (!roomCode) return { response: { ok: false, lines: ["Usage: joincode [room code]"] } };
    const affected = leaveCurrentRooms(socket, socket.id);
    const result = joinRoom(socket, roomCode, name, { account: participantAccount(socket.data.account) });
    if (!result.ok) return { response: { ok: false, lines: [result.reason] } };
    return {
      response: { ok: true, lines: [`Joined ${result.game.roomCode} as ${result.role === "spectator" ? "spectator" : result.color}.`] },
      roomEvent: "roomJoined",
      roomPayload: { roomCode: result.game.roomCode, color: result.color, role: result.role, game: sanitiseGameForViewer(result.game, socket.id) },
      gameStateRoom: result.game.roomCode,
      affectedRooms: affected.map((game) => game.roomCode),
      scheduleRoomCode: result.game.roomCode
    };
  }

  if (action === "startMatch") {
    const parsed = parseDevStartMatchArgs(args, { selectedVariant, selectedTimeControl, selectedDifficulty });
    const { variant, botCount, difficulty, timeControl } = parsed;
    if (botCount > 0 && !isAIDifficultyEnabled(difficulty, variant)) {
      return { response: { ok: false, lines: [`${capitalise(difficulty)} AI is currently disabled by the server.`] } };
    }
    const affected = leaveCurrentRooms(socket, socket.id);
    const result = createDevMatch(socket, name, {
      variant,
      timeControl,
      botCount,
      aiDifficulty: difficulty,
      account: participantAccount(socket.data.account)
    });
    if (!result.ok) return { response: { ok: false, lines: [result.reason || "Could not create match."] } };
    return {
      response: { ok: true, lines: [`Started ${result.game.variantName} in room ${result.game.roomCode} with ${botCount} bot${botCount === 1 ? "" : "s"}.`] },
      roomEvent: result.role === "spectator" ? "roomJoined" : "roomCreated",
      roomPayload: { roomCode: result.game.roomCode, color: result.color, role: result.role, game: sanitiseGameForViewer(result.game, socket.id) },
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
      roomPayload: { roomCode: result.game.roomCode, color: result.color, role: "player", game: sanitiseGameForViewer(result.game, socket.id) },
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

  if (action === "setParticipantChatColour") {
    if (!currentRoomCode) return { response: { ok: false, lines: ["No current room. Use joincode/spectatematch/startmatch first."] } };
    if (args.length < 2) return { response: { ok: false, lines: ["Usage: player textcolour [name] [colour|clear]"] } };
    const colour = args[args.length - 1];
    const targetName = args.slice(0, -1).join(" ");
    const result = setParticipantChatColourInRoom(currentRoomCode, targetName, colour);
    if (!result.ok) return { response: { ok: false, lines: [result.reason] } };
    return {
      response: { ok: true, lines: result.lines || ["Player chat colour changed."] },
      gameStateRoom: currentRoomCode
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

  if (["sudoChat", "whisperChat", "blunderQuote", "renamePlayer"].includes(action)) {
    const game = rooms.get(currentRoomCode);
    if (!game) return { response: { ok: false, lines: ["No current room."] } };
    if (action === "blunderQuote") {
      const quotes = [
        "I calculated everything except the move.",
        "My queen went on a gap year.",
        "That was theory from a universe where I am winning.",
        "The blunder was a positional sacrifice of dignity.",
        "Stockfish would understand. Eventually."
      ];
      const body = quotes[Math.floor(Math.random() * quotes.length)];
      if (!Array.isArray(game.chat)) game.chat = [];
      game.chat.push({ id: `quote-${Date.now()}`, time: Date.now(), color: "system", role: "system", name: "Blunder Oracle", body });
      return { response: { ok: true, lines: [`Blunder quote: ${body}`] }, gameStateRoom: currentRoomCode };
    }
    if (action === "sudoChat") {
      const target = String(args[0] || "").trim();
      const body = args.slice(1).join(" ").trim().slice(0, 240);
      if (!target || !body) return { response: { ok: false, lines: ["Usage: chat sudo [white|black|name] [message]"] } };
      const participant = findDevParticipant(game, target);
      if (!Array.isArray(game.chat)) game.chat = [];
      game.chat.push({ id: `sudo-${Date.now()}`, time: Date.now(), color: participant?.color || "system", role: "player", name: participant?.name || target, body });
      return { response: { ok: true, lines: [`sudo ${participant?.name || target}: ${body}`] }, gameStateRoom: currentRoomCode };
    }
    if (action === "whisperChat") {
      const target = String(args[0] || "").trim();
      const body = args.slice(1).join(" ").trim().slice(0, 240);
      if (!target || !body) return { response: { ok: false, lines: ["Usage: chat whisper [white|black|name] [message]"] } };
      const participant = findDevParticipant(game, target);
      const targetSocket = participant?.id ? io.sockets.sockets.get(participant.id) : null;
      if (targetSocket) targetSocket.emit("devCommandResult", { ok: true, lines: [`[whisper from ${name}] ${body}`] });
      return { response: { ok: true, lines: [`Whisper sent to ${participant?.name || target}.`] } };
    }
    if (action === "renamePlayer") {
      const target = String(args[0] || "").trim();
      const newName = args.slice(1).join(" ").trim().slice(0, 32);
      if (!target || !newName) return { response: { ok: false, lines: ["Usage: player rename [white|black|name] [new name]"] } };
      const participant = findDevParticipant(game, target);
      if (!participant) return { response: { ok: false, lines: ["Player not found."] } };
      participant.ref.name = newName;
      game.message = `${target} is now ${newName}.`;
      return { response: { ok: true, lines: [game.message] }, gameStateRoom: currentRoomCode };
    }
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
      if (!isAIDifficultyEnabled(game.ai?.difficulty)) {
        game.turn = previousTurn;
        return { response: { ok: false, lines: [`${capitalise(normaliseDevDifficulty(game.ai?.difficulty))} AI is currently disabled by the server.`] } };
      }
      const aiStarted = performance.now();
      const result = runAIMove(game);
      recordAIMetrics(game, game.ai?.difficulty, performance.now() - aiStarted);
      if (result.ok) markFirstMoveAndMaybeStartTimer(game);
      if (!result.ok) game.turn = previousTurn;
      return { response: { ok: result.ok, lines: [result.ok ? `Forced ${color} AI move.` : result.reason] }, gameStateRoom: currentRoomCode, scheduleRoomCode: currentRoomCode };
    }
  }

  if (action === "rankCommand") {
    const sub = String(args[0] || "list").toLowerCase();
    if (["list", "types", "all"].includes(sub)) {
      return { response: { ok: true, lines: getRankListLines() } };
    }
    if (["new", "create", "make"].includes(sub)) {
      const [rankName, chatColour, badgeRaw = null, consoleRaw = "false"] = args.slice(1);
      if (!rankName || !chatColour) return { response: { ok: false, lines: ["Usage: rank new [Name] [ChatColour] [Badge|null] [ConsoleAccess=false]"] } };
      const result = createRankType({ name: rankName, chatColour, badge: cleanBadgeArg(badgeRaw), consoleAccess: consoleRaw });
      return { response: { ok: result.ok, lines: result.lines || [result.reason] } };
    }
    if (["delete", "remove-type", "deletetype"].includes(sub)) {
      const rankName = args.slice(1).join(" ");
      if (!rankName) return { response: { ok: false, lines: ["Usage: rank delete [rank name]"] } };
      const result = deleteRankType(rankName);
      return { response: { ok: result.ok, lines: result.lines || [result.reason] } };
    }
    if (["add", "grant"].includes(sub)) {
      const [accountQuery, rankName] = args.slice(1);
      if (!accountQuery || !rankName) return { response: { ok: false, lines: ["Usage: rank add [account name] [rank name]"] } };
      const result = addRankToAccount(accountQuery, rankName);
      const affectedRooms = result.account?.id ? pushAccountAdminUpdate(result.account.id) : [];
      return { response: { ok: result.ok, lines: result.lines || [result.reason] }, affectedRooms };
    }
    if (["remove", "revoke"].includes(sub)) {
      const [accountQuery, rankName] = args.slice(1);
      if (!accountQuery || !rankName) return { response: { ok: false, lines: ["Usage: rank remove [account name] [rank name]"] } };
      const result = removeRankFromAccount(accountQuery, rankName);
      const affectedRooms = result.account?.id ? pushAccountAdminUpdate(result.account.id) : [];
      return { response: { ok: result.ok, lines: result.lines || [result.reason] }, affectedRooms };
    }
    return { response: { ok: false, lines: ["Usage: rank list | rank new [Name] [ChatColour] [Badge|null] [ConsoleAccess=false] | rank add/remove [account] [rank] | rank delete [rank]"] } };
  }

  if (action === "badgeCommand") {
    const sub = String(args[0] || "list").toLowerCase();
    if (["list", "catalog", "all"].includes(sub)) {
      const badges = getBadgeCatalog();
      return { response: { ok: true, lines: badges.length ? badges.map((badge) => `${badge} -> /badges/${badge}`) : ["No badge files found in client/public/badges."] } };
    }
    if (["grant", "add", "give"].includes(sub)) {
      const [accountQuery, badgeRaw] = args.slice(1);
      if (!accountQuery || !badgeRaw) return { response: { ok: false, lines: ["Usage: badge grant [account] [badge-file]"] } };
      const result = grantBadgeToAccount(accountQuery, cleanBadgeArg(badgeRaw));
      const affectedRooms = result.account?.id ? pushAccountAdminUpdate(result.account.id) : [];
      return { response: { ok: result.ok, lines: result.lines || [result.reason] }, affectedRooms };
    }
    if (["revoke", "remove", "take"].includes(sub)) {
      const [accountQuery, badgeRaw] = args.slice(1);
      if (!accountQuery || !badgeRaw) return { response: { ok: false, lines: ["Usage: badge revoke [account] [badge-file]"] } };
      const result = revokeBadgeFromAccount(accountQuery, cleanBadgeArg(badgeRaw));
      const affectedRooms = result.account?.id ? pushAccountAdminUpdate(result.account.id) : [];
      return { response: { ok: result.ok, lines: result.lines || [result.reason] }, affectedRooms };
    }
    if (["equip", "set"].includes(sub)) {
      const [accountQuery, badgeRaw] = args.slice(1);
      if (!accountQuery) return { response: { ok: false, lines: ["Usage: badge equip [account] [badge-file|null]"] } };
      const result = equipBadgeForAccount(accountQuery, cleanBadgeArg(badgeRaw || "null"));
      const affectedRooms = result.account?.id ? pushAccountAdminUpdate(result.account.id) : [];
      return { response: { ok: result.ok, lines: result.lines || [result.reason] }, affectedRooms };
    }
    return { response: { ok: false, lines: ["Usage: badge list | badge grant/revoke/equip [account] [badge-file|null]"] } };
  }

  if (action === "reportCommand") {
    const sub = String(args[0] || "list").toLowerCase();
    if (["list", "open"].includes(sub)) return { response: { ok: true, lines: listReports(args[1] || "date") } };
    if (["view", "case", "opencase"].includes(sub)) {
      const result = reportCaseLines(args[1]);
      const reportCase = getReportCase(args[1]);
      return { response: { ok: result.ok, lines: result.lines, reportCase } };
    }
    if (["approve", "deny", "resolve"].includes(sub)) {
      const id = args[1];
      const decision = sub === "approve" ? "approve" : sub === "deny" ? "deny" : args[2];
      const offset = sub === "resolve" ? 3 : 2;
      const punishmentType = args[offset] || "mute";
      const duration = args[offset + 1] || "24h";
      const reason = args.slice(offset + 2).join(" ") || "Report resolved";
      const result = resolveReport({ id, decision, punishmentType, duration, reason, createdBy: name });
      if (!result.ok) return { response: { ok: false, lines: [result.reason] } };
      notifyPunishedClients(result.punishment);
      return { response: { ok: true, lines: [result.punishment ? `Approved ${id}; ${result.punishment.type} ${result.punishment.id}.` : `Denied ${id}.`] } };
    }
    if (sub === "appeals") return { response: { ok: true, lines: listAppeals() } };
    if (sub === "appeal") {
      const mode = String(args[1] || "list").toLowerCase();
      if (mode === "list") return { response: { ok: true, lines: listAppeals() } };
      if (mode === "view") { const result = appealLines(args[2]); return { response: { ok: result.ok, lines: result.lines } }; }
      if (["approve", "deny"].includes(mode)) { const result = resolveAppeal(args[2], mode); return { response: { ok: result.ok, lines: [result.ok ? `${mode}d appeal ${args[2]}.` : result.reason] } }; }
    }
    return { response: { ok: false, lines: ["Usage: report list [date|strength|name] | report view [id] | report approve [id] [mute|ban] [duration|-1] [reason] | report deny [id] | report appeal list|view|approve|deny ..."] } };
  }

  if (action === "punishCommand") {
    const sub = String(args[0] || "list").toLowerCase();
    if (["list", "active"].includes(sub)) return { response: { ok: true, lines: listPunishments(true) } };
    if (sub === "all") return { response: { ok: true, lines: listPunishments(false) } };
    if (["mute", "ban"].includes(sub)) {
      const targetQuery = args[1];
      const duration = args[2] || "24h";
      const reason = args.slice(3).join(" ") || `${sub} by developer`;
      const target = devPunishmentTarget(targetQuery, currentRoomCode);
      if (!target) return { response: { ok: false, lines: ["Target not found. Use account username, white/black/current room player, or device id."] } };
      const result = addPunishmentForTarget(target, sub, duration, reason);
      notifyPunishedClients(result.punishment);
      return { response: { ok: true, lines: [`${sub} created: ${result.punishment.id} for ${target.accountName || target.name || target.deviceId}.`] } };
    }
    if (["remove", "unpunish", "clear"].includes(sub)) {
      const result = removePunishment(args[1]);
      return { response: { ok: result.ok, lines: [result.ok ? `Removed ${args[1]}.` : result.reason] } };
    }
    return { response: { ok: false, lines: ["Usage: punish list|all|mute|ban|remove ..."] } };
  }

  if (action === "friendCommand") {
    const sub = String(args[0] || "list").toLowerCase();
    const account = socket.data?.account;
    if (!account) return { response: { ok: false, lines: ["Developer socket is not logged into an account for friend test commands."] } };
    if (sub === "list") return { response: { ok: true, lines: JSON.stringify(getSocialState(account.id), null, 2).split("\n") } };
    if (sub === "send") { const result = sendFriendRequest(account.id, args.slice(1).join(" ")); return { response: { ok: result.ok, lines: [result.ok ? `Friend request sent to ${result.targetAccount.username}.` : result.reason] } }; }
    if (sub === "accept") { const result = respondFriendRequest(account.id, args[1], true); return { response: { ok: result.ok, lines: [result.ok ? "Friend request accepted." : result.reason] } }; }
    return { response: { ok: false, lines: ["Usage: friend list|send [name]|accept [id/name]"] } };
  }

  if (action === "leaderboardCommand") {
    const sub = String(args[0] || "show").toLowerCase();
    const variant = args[1] || selectedVariant || "normal";
    const scope = args[2] || "month";
    if (["show", "list", "top"].includes(sub)) return { response: { ok: true, lines: leaderboardLines(variant, scope, 100) } };
    if (["reset", "clear", "wipe"].includes(sub)) {
      if (!args[1]) return { response: { ok: false, lines: ["Usage: leaderboard reset [variant] [month|allTime|both]"] } };
      const result = resetLeaderboard(args[1], args[2] || "month");
      return { response: { ok: result.ok, lines: [result.ok ? `Reset ${result.variant} leaderboard (${result.scope}); removed ${result.resetCount} entries.` : result.reason] } };
    }
    return { response: { ok: false, lines: ["Usage: leaderboard show [variant] [month|allTime] | leaderboard reset [variant] [month|allTime|both]"] } };
  }

  if (action === "profileCommand") {
    const query = args.join(" ") || name;
    const result = publicProfile(query, socket.data?.account?.id || null);
    if (!result.ok) return { response: { ok: false, lines: [result.reason] } };
    const p = result.profile;
    const byMode = Object.entries(p.stats?.byVariant || {}).map(([variant, stat]) => `${variant}: ${stat.games}G ${stat.wins}W ${stat.losses}L ${stat.draws}D`).join(" | ") || "none";
    return { response: { ok: true, lines: [`${p.username} | created ${new Date(p.createdAt).toISOString()}`, `Games ${p.stats.totalGames} | W ${p.stats.wins} L ${p.stats.losses} D ${p.stats.draws}`, `By mode: ${byMode}`, `Ranks: ${JSON.stringify(p.ranks || {})}`] } };
  }

  const utility = runDevUtilityCommand(currentRoomCode, action, args, socket.id, name);
  if (utility) {
    if (!utility.ok) return { response: { ok: false, lines: [utility.reason || "Command failed."] } };
    if (utility.kickedSocketId) {
      const targetSocket = io.sockets.sockets.get(utility.kickedSocketId);
      if (targetSocket) {
        const reason = utility.kickedMessage || utility.lines?.[0] || "You've been kicked.";
        recordOutgoing("devKickedHome", { reason }, currentRoomCode, 1);
        targetSocket.emit("devKickedHome", { reason });
        updateConnectedClient(utility.kickedSocketId, connectedClients.get(utility.kickedSocketId)?.name || "Guest", null);
      }
    }
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



function routeStructuredDevCommand(action, args = []) {
  const first = String(args[0] || "").toLowerCase();
  const second = String(args[1] || "").toLowerCase();

  if (action === "room") {
    if (first === "list") return { action: second === "detailed" ? "listRoomsDetailed" : "findOpenMatches", args: args.slice(2) };
    if (first === "spectate") return { action: "spectateMatch", args: args.slice(1) };
    if (first === "join") return { action: "joinCode", args: args.slice(1) };
    if (first === "start") return { action: "startMatch", args: args.slice(1) };
    if (first === "botbattle") return { action: "startMatch", args: [args[1], "2", args[2] || "medium"] };
    if (first === "exit") return { action: "exitMatch", args: [] };
    if (first === "info") return { action: "roomInfo", args: args.slice(1) };
    if (first === "close") return { action: "closeRoom", args: args.slice(1) };
    if (first === "kick") return { action: "kickPlayer", args: args.slice(1) };
    if (first === "lock") return { action: "lockRoom", args: [] };
    if (first === "unlock") return { action: "unlockRoom", args: [] };
    if (first === "rename") return { action: "renameRoom", args: args.slice(1) };
  }

  if (action === "player") {
    if (first === "bot") return { action: "replaceWithBot", args: args.slice(1) };
    if (first === "takeover") return { action: "replacePlayer", args: args.slice(1) };
    if (first === "find") return { action: "findPlayer", args: args.slice(1) };
    if (first === "count") return { action: "playerCount", args: [] };
    if (first === "override") return { action: ["off", "false", "0"].includes(String(args.at(-1)).toLowerCase()) ? "clearOverride" : "spectatorOverride", args: ["on", "off", "true", "false", "0", "1"].includes(String(args.at(-1)).toLowerCase()) ? args.slice(1, -1) : args.slice(1) };
    if (first === "colour" || first === "color") return { action: "setPlayerColour", args: args.slice(1) };
    if (["textcolour", "textcolor", "chatcolour", "chatcolor"].includes(first)) return { action: "setParticipantChatColour", args: args.slice(1) };
    if (first === "rename") return { action: "renamePlayer", args: args.slice(1) };
  }

  if (action === "match") {
    if (first === "end") return { action: "endMatch", args: args.slice(1) };
    if (first === "turn") return { action: "setTurn", args: args.slice(1) };
    if (first === "reset") return { action: "resetMatch", args: [] };
    if (first === "validate") return { action: "validateBoard", args: [] };
    if (first === "forfeit") return { action: "forfeitDev", args: [] };
  }

  if (action === "chat") {
    if (first === "shout") return { action: "shout", args: args.slice(1) };
    if (["announce", "system"].includes(first)) return { action: "systemChat", args: args.slice(1) };
    if (first === "sudo") return { action: "sudoChat", args: args.slice(1) };
    if (first === "whisper") return { action: "whisperChat", args: args.slice(1) };
    if (first === "quote") return { action: "blunderQuote", args: args.slice(1) };
  }

  if (action === "board") {
    if (first === "clear") return { action: "clearBoard", args: [] };
    if (first === "copy") return { action: "clonePosition", args: [] };
    if (first === "load") return { action: "loadPosition", args: args.slice(1) };
    if (first === "mirror") return { action: "mirrorBoard", args: [] };
    if (first === "shuffle" && second === "backrank") return { action: "shuffleBackRank", args: [] };
  }

  if (action === "piece") {
    if (first === "add") return { action: "addPiece", args: args.slice(1) };
    if (first === "remove") return { action: "removePiece", args: args.slice(1) };
    if (first === "teleport") return { action: "teleportPiece", args: args.slice(1) };
    if (first === "force") return { action: "moveForce", args: args.slice(1) };
    if (first === "replace") return { action: "replacePiece", args: args.slice(1) };
    if (first === "list") return { action: "listPieces", args: args.slice(1) };
    if (first === "find") return { action: "findPiece", args: args.slice(1) };
    if (first === "legal") return { action: "legalMovesAt", args: args.slice(1) };
    if (first === "attacks") return { action: "attackSquaresAt", args: args.slice(1) };
    if (first === "kill" && second === "king") return { action: "killKing", args: args.slice(2) };
    if (first === "promote") return { action: "promotePiece", args: args.slice(1) };
    if (first === "moved") return { action: "setPieceMoved", args: args.slice(1) };
    if (first === "god") return { action: "godPiece", args: args.slice(1) };
  }

  if (action === "ai") {
    if (["availability", "limits", "status"].includes(first)) return { action: "aiAvailability", args: args.slice(1) };
    if (["disable", "enable"].includes(first)) return { action: "aiAvailability", args };
    if (first === "think") return { action: "aiThink", args: args.slice(1) };
    if (first === "move") return { action: "forceAIMove", args: args.slice(1) };
    if (first === "difficulty") return { action: "setAIDifficulty", args: args.slice(1) };
    if (first === "pause") return { action: "pauseBots", args: [] };
    if (first === "resume") return { action: "resumeBots", args: [] };
    if (first === "eval") return { action: "evalPosition", args: args.slice(1) };
    if (first === "top") return { action: "topMoves", args: args.slice(1) };
  }

  if (action === "support" || action === "stripe" || action === "donate" || action === "donations") {
    return { action: "siteCommand", args: ["support", ...args] };
  }
  if (action === "site") {
    return { action: "siteCommand", args };
  }


  if (action === "account" || action === "accounts") {
    return { action: "accountCommand", args };
  }
  if (action === "rank" || action === "ranks") return { action: "rankCommand", args };
  if (action === "badge" || action === "badges") return { action: "badgeCommand", args };
  if (action === "report" || action === "reports") return { action: "reportCommand", args };
  if (action === "punish" || action === "punishment" || action === "punishments") return { action: "punishCommand", args };
  if (action === "friend" || action === "friends") return { action: "friendCommand", args };
  if (action === "leaderboard" || action === "leaderboards" || action === "lb") return { action: "leaderboardCommand", args };
  if (action === "profile") return { action: "profileCommand", args };

  if (action === "network") {
    return { action: "networkCommand", args };
  }

  if (action === "clock") {
    if (first === "set") return { action: "setTimer", args: args[1] && ["white","black"].includes(String(args[1]).toLowerCase()) ? [args[2], args[1]] : args.slice(1) };
    if (first === "pause") return { action: "pauseTimer", args: [] };
    if (first === "resume") return { action: "resumeTimer", args: [] };
    if (first === "add") return { action: "addTime", args: args.slice(1) };
    if (first === "preset") return { action: "setTimeControl", args: args.slice(1) };
    if (first === "flag") return { action: "flagPlayer", args: args.slice(1) };
  }

  if (action === "chaos") return { action: "chaosCommand", args };
  if (action === "threecheck") return { action: "threeCheckCommand", args };
  if (action === "antichess") return { action: "antichessCommand", args };
  if (action === "anarchy") return { action: "anarchyCommand", args };
  if (action === "rulelab") return { action: "ruleLabCommand", args };
  if (action === "predict") return { action: "predictCommand", args };
  if (action === "scooby") return { action: "scoobyCommand", args };
  if (action === "tycoon") return { action: "tycoonCommand", args };
  if (action === "nuke") {
    const firstLooksLocation = parseChessSquare(args[0]) || parseXYZ(args[0]) || Number.isInteger(Number.parseInt(args[0], 10));
    return { action: "nukeCommand", args: firstLooksLocation ? ["blast", ...args] : args };
  }
  if (action === "crazyhouse") return { action: "crazyhouseCommand", args };
  if (action === "atomic") return { action: "atomicCommand", args };
  if (action === "hill") return { action: "hillCommand", args };

  return { action, args };
}


function updateConnectedClient(socketId, name = "", roomCode = null, presence = null) {
  if (!socketId) return;
  const existing = connectedClients.get(socketId) || { id: socketId, connectedAt: Date.now() };
  const account = socketId && io?.sockets?.sockets?.get(socketId)?.data?.account;
  const clean = String(account?.username || name || existing.name || "Guest").trim().slice(0, 32) || "Guest";
  connectedClients.set(socketId, {
    ...existing,
    id: socketId,
    name: clean,
    guest: !account,
    accountId: account?.id || null,
    accountName: account?.username || null,
    lastRoomCode: roomCode || existing.lastRoomCode || null,
    presence: presence || existing.presence || (roomCode ? "room" : "lobby"),
    lastSeen: Date.now()
  });
}


function socketIsInAnyGameRoom(socketId) {
  for (const game of rooms.values()) {
    if (game.players?.white?.id === socketId || game.players?.black?.id === socketId) return true;
    if ((game.spectators || []).some((spectator) => spectator.id === socketId)) return true;
  }
  return false;
}

function resolveForcedVisualTargets(targetRaw, currentRoomCode, requesterId) {
  const target = String(targetRaw || "").trim().toLowerCase();
  const currentGame = currentRoomCode ? rooms.get(currentRoomCode) : null;
  const allSocketIds = Array.from(io.sockets.sockets.keys());

  const unique = (ids) => [...new Set(ids.filter(Boolean).filter((id) => io.sockets.sockets.has(id)))];

  if (["self", "me"].includes(target)) return unique([requesterId]);
  if (["all", "*", "everyone"].includes(target)) return unique(allSocketIds.filter((id) => id !== requesterId));
  if (["lobby", "home"].includes(target)) {
    return unique(allSocketIds.filter((id) => {
      if (id === requesterId) return false;
      const client = connectedClients.get(id);
      return client?.presence === "lobby" || (!client?.presence && !socketIsInAnyGameRoom(id));
    }));
  }

  if (["room", "others", "opponent", "opponents"].includes(target)) {
    if (!currentGame) return [];
    let ids = [
      currentGame.players?.white?.id,
      currentGame.players?.black?.id,
      ...(currentGame.spectators || []).map((spectator) => spectator.id)
    ];
    if (target === "others" || target === "opponent" || target === "opponents") ids = ids.filter((id) => id !== requesterId);
    return unique(ids);
  }

  if (currentGame && ["white", "black"].includes(target)) {
    return unique([currentGame.players?.[target]?.id]);
  }

  if (currentGame && ["spectator", "spectators"].includes(target)) {
    return unique((currentGame.spectators || []).map((spectator) => spectator.id));
  }

  if (currentGame) {
    const participant = findDevParticipant(currentGame, target);
    if (participant?.id) return unique([participant.id]);
  }

  const byConnectedName = Array.from(connectedClients.values()).filter((client) => {
    const name = String(client.name || "").toLowerCase();
    return client.id.toLowerCase() === target || name === target || name.includes(target);
  }).map((client) => client.id);
  return unique(byConnectedName);
}

function findDevParticipant(game, targetRaw) {
  const target = String(targetRaw || "").trim().toLowerCase();
  if (!game || !target) return null;
  for (const color of ["white", "black"]) {
    const player = game.players?.[color];
    if (!player) continue;
    if (target === color || player.name?.toLowerCase() === target || player.name?.toLowerCase()?.includes(target)) {
      return { role: "player", color, id: player.id, name: player.name, ref: player };
    }
  }
  for (const spectator of game.spectators || []) {
    if (spectator.name?.toLowerCase() === target || spectator.name?.toLowerCase()?.includes(target)) {
      return { role: "spectator", color: "spectator", id: spectator.id, name: spectator.name, ref: spectator };
    }
  }
  return null;
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
  if (["nuke", "nukechess"].includes(text)) return "nuke";
  if (["tycoon", "tycoonchess"].includes(text)) return "tycoon";
  if (["predict", "predictchess"].includes(text)) return "predict";
  if (["scooby", "scoobychess"].includes(text)) return "scooby";
  if (["threed", "3d", "3dchess", "three", "threechess"].includes(text)) return "threeD";
  return "threeD";
}

function getVariantLabelServer(variantRaw) {
  const variant = normaliseDevVariant(variantRaw);
  const game = Array.from(rooms.values()).find((item) => item.variant === variant);
  if (game?.variantName) return game.variantName;
  return variant;
}

function normaliseDevTimeControl(value) {
  const raw = String(value || "").trim();
  const key = raw.toLowerCase().replace(/[\s_-]+/g, "");
  const aliases = {
    unlimited: "unlimited", infinite: "unlimited", infinity: "unlimited", none: "unlimited", noclock: "unlimited", untimed: "unlimited",
    bullet: "bullet", "1+0": "bullet", "1|0": "bullet", "1/0": "bullet", "1m": "bullet",
    bullet11: "bullet1_1", "1+1": "bullet1_1", "1|1": "bullet1_1", "1/1": "bullet1_1",
    bullet21: "bullet2_1", "2+1": "bullet2_1", "2|1": "bullet2_1", "2/1": "bullet2_1",
    blitz3: "blitz3", blitz30: "blitz3", "3+0": "blitz3", "3|0": "blitz3", "3/0": "blitz3",
    blitz32: "blitz3_2", "3+2": "blitz3_2", "3|2": "blitz3_2", "3/2": "blitz3_2",
    blitz: "blitz", blitz50: "blitz", "5+0": "blitz", "5|0": "blitz", "5/0": "blitz", "5m": "blitz",
    blitz53: "blitz5_3", "5+3": "blitz5_3", "5|3": "blitz5_3", "5/3": "blitz5_3",
    rapid: "rapid", rapid100: "rapid", "10+0": "rapid", "10|0": "rapid", "10/0": "rapid", "10m": "rapid",
    rapid105: "rapid10_5", "10+5": "rapid10_5", "10|5": "rapid10_5", "10/5": "rapid10_5",
    rapid1510: "rapid15_10", "15+10": "rapid15_10", "15|10": "rapid15_10", "15/10": "rapid15_10",
    rapid30: "rapid30", rapid300: "rapid30", "30+0": "rapid30", "30|0": "rapid30", "30/0": "rapid30",
    classical: "classical", classic: "classical", classical3020: "classical", "30+20": "classical", "30|20": "classical", "30/20": "classical",
    classical4545: "classical45_45", "45+45": "classical45_45", "45|45": "classical45_45", "45/45": "classical45_45",
    classical60: "classical60", classical600: "classical60", "60+0": "classical60", "60|0": "classical60", "60/0": "classical60", "1h": "classical60",
    classical9030: "classical90_30", "90+30": "classical90_30", "90|30": "classical90_30", "90/30": "classical90_30"
  };
  return aliases[key] || raw || "rapid";
}

function isDevDifficultyToken(value) {
  return ["easy", "medium", "hard"].includes(String(value || "").trim().toLowerCase());
}

function parseDevStartMatchArgs(args, defaults = {}) {
  const variant = normaliseDevVariant(args[0] || defaults.selectedVariant || "threeD");
  let rest = args.slice(1).filter((item) => String(item ?? "").trim());
  let botCount = 0;
  if (rest.length && /^\d+$/.test(String(rest[0]))) {
    botCount = Math.min(2, Math.max(0, Number.parseInt(rest[0], 10) || 0));
    rest = rest.slice(1);
  }
  let difficulty = normaliseDevDifficulty(defaults.selectedDifficulty || "medium");
  let timeControl = normaliseDevTimeControl(defaults.selectedTimeControl || "rapid");
  for (const token of rest) {
    if (isDevDifficultyToken(token)) difficulty = normaliseDevDifficulty(token);
    else timeControl = normaliseDevTimeControl(token);
  }
  return { variant, botCount, difficulty, timeControl };
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

function normaliseDeviceId(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const cleaned = text.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 128);
  if (cleaned.length >= 8) return cleaned;
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

const pendingAITimers = new Map();

function isBotOnlyGame(game) {
  const aiColors = Array.isArray(game?.ai?.colors) ? game.ai.colors : [];
  return aiColors.includes("white") && aiColors.includes("black");
}

function getAIDelayMs(game) {
  if (game?.ai?.delayMs && Number(game.ai.delayMs) !== 650) return Number(game.ai.delayMs);
  if (isBotOnlyGame(game)) return game.variant === "threeD" ? 3000 : 1500;
  return game?.variant === "threeD" ? 900 : 650;
}

function scheduleAIMoveIfNeeded(game) {
  if (!isAITurn(game) || pendingAITimers.has(game.roomCode)) return;

  const delayMs = getAIDelayMs(game);
  const timerId = setTimeout(() => {
    pendingAITimers.delete(game.roomCode);

    const currentGame = rooms.get(game.roomCode);
    if (!currentGame || !isAITurn(currentGame)) return;

    tickGameClock(currentGame);
    if (!isAITurn(currentGame)) {
      emitGameStateToRoom(io, currentGame);
      return;
    }

    if (!isAIDifficultyEnabled(currentGame.ai?.difficulties?.[currentGame.turn] || currentGame.ai?.difficulty, currentGame.variant)) {
      currentGame.message = `${capitalise(normaliseDevDifficulty(currentGame.ai?.difficulties?.[currentGame.turn] || currentGame.ai?.difficulty))} AI is currently disabled for ${currentGame.variantName || currentGame.variant} by the server.`;
      emitGameStateToRoom(io, currentGame);
      return;
    }

    const aiStarted = performance.now();
    const result = runAIMove(currentGame);
    recordAIMetrics(currentGame, currentGame.ai?.difficulty, performance.now() - aiStarted);
    if (result.ok) markFirstMoveAndMaybeStartTimer(currentGame);
    if (!result.ok) {
      currentGame.message = result.reason || "AI could not move.";
    }

    emitGameStateToRoom(io, currentGame);
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
    emitGameStateToRoom(io, game);
    scheduleAIMoveIfNeeded(game);
  }
}, 1000);
