import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { findAccount, findAccountById, adjustAccountCredibility, recordAccountPunishment, recordAccountEloHistory, publicAccount } from "./accountStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOCIAL_STORE_VERSION = 1;
const DEFAULT_STORE_PATH = path.join(__dirname, "data", "social.json");
const STORE_PATH = process.env.SOCIAL_STORE_PATH || DEFAULT_STORE_PATH;
const BASE_ELO = 800;

let state = loadState();

function loadState() {
  try {
    if (!fs.existsSync(STORE_PATH)) return makeEmptyState();
    return migrateState(JSON.parse(fs.readFileSync(STORE_PATH, "utf8")));
  } catch (error) {
    console.error(`[social] failed to load social store: ${error.message}`);
    return makeEmptyState();
  }
}

function makeEmptyState() {
  return {
    schemaVersion: SOCIAL_STORE_VERSION,
    reports: [],
    appeals: [],
    punishments: [],
    friendships: [],
    friendRequests: [],
    friendMessages: [],
    challenges: [],
    leaderboards: { schemaVersion: 1, months: {}, allTime: {} },
    auditLog: []
  };
}

function migrateState(raw) {
  const next = raw && typeof raw === "object" ? raw : makeEmptyState();
  next.schemaVersion = SOCIAL_STORE_VERSION;
  next.reports = Array.isArray(next.reports) ? next.reports : [];
  next.appeals = Array.isArray(next.appeals) ? next.appeals : [];
  next.punishments = Array.isArray(next.punishments) ? next.punishments : [];
  next.friendships = Array.isArray(next.friendships) ? next.friendships : [];
  next.friendRequests = Array.isArray(next.friendRequests) ? next.friendRequests : [];
  next.friendMessages = Array.isArray(next.friendMessages) ? next.friendMessages : [];
  next.challenges = Array.isArray(next.challenges) ? next.challenges : [];
  next.leaderboards = next.leaderboards || { schemaVersion: 1, months: {}, allTime: {} };
  next.leaderboards.months = next.leaderboards.months || {};
  next.leaderboards.allTime = next.leaderboards.allTime || {};
  next.auditLog = Array.isArray(next.auditLog) ? next.auditLog : [];
  return next;
}

function saveState() {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  const tmp = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STORE_PATH);
}

export function socialStorePath() { return STORE_PATH; }

function nowMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function cleanText(value, max = 600) {
  return String(value || "").trim().slice(0, max);
}

function normaliseDurationMs(raw) {
  const text = String(raw || "").trim().toLowerCase();
  if (!text) return 24 * 60 * 60 * 1000;
  if (["-1", "perm", "permanent", "forever"].includes(text)) return -1;
  const match = text.match(/^(\d+)(m|h|d|w)?$/);
  if (!match) return 24 * 60 * 60 * 1000;
  const n = Number(match[1]);
  const unit = match[2] || "h";
  const mult = unit === "m" ? 60 * 1000 : unit === "h" ? 60 * 60 * 1000 : unit === "d" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  return n * mult;
}

function containsHarmfulLanguage(text) {
  const value = String(text || "").toLowerCase();
  const patterns = [
    /\bf+u+c+k+\b/i,
    /\bs+h+i+t+\b/i,
    /\bc+u+n+t+\b/i,
    /\bf+a+g+\b/i,
    /\br+e+t+a+r+d+\b/i,
    /\bk+y+s+\b/i,
    /\bn+i+g+g+e+r+\b/i,
    /\bkill yourself\b/i,
    /\bsuicide\b/i
  ];
  return patterns.some((pattern) => pattern.test(value));
}

function accountRef(account) {
  return account ? { accountId: account.id, username: account.username } : null;
}

function deviceRef(socket) {
  return socket?.data?.deviceId || null;
}

function participantForSocket(game, socketId) {
  if (!game) return null;
  if (game.players?.white?.id === socketId) return { ...game.players.white, color: "white", role: "player" };
  if (game.players?.black?.id === socketId) return { ...game.players.black, color: "black", role: "player" };
  const spectator = (game.spectators || []).find((item) => item.id === socketId);
  return spectator ? { ...spectator, role: "spectator" } : null;
}

function opponentFor(game, participant) {
  if (!game || !participant?.color) return null;
  if (participant.color === "white") return game.players?.black ? { ...game.players.black, color: "black" } : null;
  if (participant.color === "black") return game.players?.white ? { ...game.players.white, color: "white" } : null;
  return null;
}

function participantIdentity(participant, socket = null) {
  return {
    socketId: participant?.id || socket?.id || null,
    name: participant?.name || socket?.data?.account?.username || "Guest",
    color: participant?.color || null,
    accountId: participant?.accountId || socket?.data?.account?.id || null,
    accountName: participant?.accountName || socket?.data?.account?.username || null,
    deviceId: socket?.data?.deviceId || participant?.deviceId || null,
    guest: !participant?.accountId && !socket?.data?.account?.id
  };
}

function reportStrength(score) {
  if (score >= 70) return "strong";
  if (score >= 35) return "medium";
  return "weak";
}

function credibilityFor(accountId) {
  const account = accountId ? findAccountById(accountId) : null;
  return Number(account?.moderation?.credibility ?? 50);
}

function makeEvidenceSummary(game, reporter, reported, reason) {
  const chat = (game.chat || []).slice(-120);
  const harmfulChat = chat.filter((message) => containsHarmfulLanguage(`${message.name} ${message.body}`));
  const harmfulNames = [game.players?.white?.name, game.players?.black?.name].filter((name) => containsHarmfulLanguage(name));
  const illegalMoves = (game.illegalMoveAttempts || []).slice(-50);
  const credibility = credibilityFor(reporter.accountId);
  let score = 5;
  score += harmfulChat.length * 25;
  score += harmfulNames.length * 20;
  score += illegalMoves.length * 10;
  score += Math.max(-20, Math.min(20, credibility - 50)) * 0.5;
  if (containsHarmfulLanguage(reason)) score += 10;
  return {
    score: Math.round(score),
    strength: reportStrength(score),
    harmfulChatCount: harmfulChat.length,
    harmfulNames,
    illegalMoveCount: illegalMoves.length,
    reporterCredibility: credibility,
    harmfulChat: harmfulChat.slice(-20),
    illegalMoves
  };
}

export function createReport({ game, reporterSocket, reason }) {
  if (!game || !reporterSocket) return { ok: false, reason: "No active game to report." };
  const reporterParticipant = participantForSocket(game, reporterSocket.id);
  if (!reporterParticipant || reporterParticipant.role !== "player") return { ok: false, reason: "Only active players can report opponents." };
  const reportedParticipant = opponentFor(game, reporterParticipant);
  if (!reportedParticipant) return { ok: false, reason: "No opponent found to report." };
  const reporter = participantIdentity(reporterParticipant, reporterSocket);
  const reported = participantIdentity(reportedParticipant, null);
  const createdAt = Date.now();
  const evidence = makeEvidenceSummary(game, reporter, reported, reason);
  const report = {
    id: `REP-${String(state.reports.length + 1).padStart(4, "0")}-${randomUUID().slice(0, 6).toUpperCase()}`,
    status: "open",
    createdAt,
    updatedAt: createdAt,
    roomCode: game.roomCode,
    variant: game.variant,
    variantName: game.variantName,
    timeControl: game.timeControl,
    reporter,
    reported,
    reason: cleanText(reason || "No reason supplied", 500),
    evidence,
    slice: {
      chat: (game.chat || []).slice(-200),
      moveHistory: (game.moveHistory || []).slice(-240),
      illegalMoveAttempts: (game.illegalMoveAttempts || []).slice(-80),
      snapshots: (game.reportSnapshots || []).slice(-40),
      clocks: game.clocks,
      players: game.players,
      createdAt: game.createdAt,
      status: game.status,
      winner: game.winner || null
    }
  };
  state.reports.push(report);
  state.auditLog.push({ type: "reportCreated", reportId: report.id, at: createdAt });
  saveState();
  return { ok: true, report };
}

export function listReports(sort = "date") {
  const open = state.reports.filter((r) => r.status === "open");
  const weight = { weak: 1, medium: 2, strong: 3 };
  if (sort === "strength") open.sort((a, b) => (weight[b.evidence?.strength] || 0) - (weight[a.evidence?.strength] || 0) || b.createdAt - a.createdAt);
  else if (sort === "name") open.sort((a, b) => String(a.reported?.name).localeCompare(String(b.reported?.name)));
  else open.sort((a, b) => b.createdAt - a.createdAt);
  if (!open.length) return ["No open report cases."];
  return open.map((r) => `${r.id} | ${r.evidence?.strength || "weak"} | ${new Date(r.createdAt).toISOString()} | ${r.reporter.name} → ${r.reported.name} | ${r.variantName} | ${r.reason}`);
}

export function getReportCase(id) {
  return state.reports.find((report) => report.id.toLowerCase() === String(id || "").trim().toLowerCase()) || null;
}

export function reportCaseLines(id) {
  const report = getReportCase(id);
  if (!report) return { ok: false, lines: ["Report case not found."] };
  const lines = [
    `Report ${report.id} | ${report.status} | ${report.evidence?.strength?.toUpperCase() || "WEAK"}`,
    `Room ${report.roomCode} | ${report.variantName} | ${new Date(report.createdAt).toISOString()}`,
    `Reporter: ${report.reporter.name}${report.reporter.accountId ? ` (${report.reporter.accountName})` : " (guest)"} | credibility ${report.evidence?.reporterCredibility ?? "n/a"}`,
    `Reported: ${report.reported.name}${report.reported.accountId ? ` (${report.reported.accountName})` : " (guest)"}`,
    `Reason: ${report.reason}`,
    `Evidence: harmful chat ${report.evidence?.harmfulChatCount || 0}, illegal moves ${report.evidence?.illegalMoveCount || 0}, harmful names ${(report.evidence?.harmfulNames || []).join(", ") || "none"}`,
    "Illegal moves:",
    ...((report.slice?.illegalMoveAttempts || []).slice(-20).map((item) => `- ${new Date(item.at).toISOString()} ${item.player || item.socketId}: ${item.reason}`) || ["- none"]),
    "Chat:",
    ...((report.slice?.chat || []).slice(-50).map((message) => `[${new Date(message.time || report.createdAt).toISOString()}] ${message.name}: ${message.body}`) || ["- none"])
  ];
  return { ok: true, lines };
}

function createPunishment({ target, type, durationRaw, reason, reportId, createdBy = "developer" }) {
  const durationMs = normaliseDurationMs(durationRaw);
  const now = Date.now();
  const punishment = {
    id: `PUN-${String(state.punishments.length + 1).padStart(4, "0")}-${randomUUID().slice(0, 6).toUpperCase()}`,
    type,
    reason: cleanText(reason || "No reason supplied", 400),
    createdAt: now,
    updatedAt: now,
    expiresAt: durationMs === -1 ? -1 : now + durationMs,
    active: true,
    reportId: reportId || null,
    createdBy,
    target: {
      accountId: target.accountId || null,
      accountName: target.accountName || null,
      deviceId: target.deviceId || null,
      name: target.name || null
    }
  };
  state.punishments.push(punishment);
  if (punishment.target.accountId) recordAccountPunishment(punishment.target.accountId, punishment);
  saveState();
  return punishment;
}

export function resolveReport({ id, decision, punishmentType = "mute", duration = "24h", reason = "Report approved", createdBy = "developer" }) {
  const report = getReportCase(id);
  if (!report) return { ok: false, reason: "Report case not found." };
  if (report.status !== "open") return { ok: false, reason: "Report is already resolved." };
  const approved = ["approve", "approved", "yes", "true"].includes(String(decision || "").toLowerCase());
  report.status = approved ? "approved" : "denied";
  report.resolvedAt = Date.now();
  report.updatedAt = report.resolvedAt;
  report.resolution = { approved, punishmentType: approved ? punishmentType : null, duration: approved ? duration : null, reason, createdBy };
  let punishment = null;
  if (approved) {
    adjustAccountCredibility(report.reporter.accountId, +5, `approved report ${report.id}`);
    adjustAccountCredibility(report.reported.accountId, -10, `punished from report ${report.id}`);
    punishment = createPunishment({ target: report.reported, type: punishmentType, durationRaw: duration, reason, reportId: report.id, createdBy });
  } else {
    adjustAccountCredibility(report.reporter.accountId, -5, `denied report ${report.id}`);
  }
  state.reports = state.reports.filter((r) => r.id !== report.id);
  state.auditLog.push({ type: "reportResolved", reportId: report.id, approved, at: report.resolvedAt, punishmentId: punishment?.id || null });
  saveState();
  return { ok: true, report, punishment };
}

function punishmentMatches(p, { accountId, deviceId }) {
  return Boolean(
    p.active &&
    (p.expiresAt === -1 || p.expiresAt > Date.now()) &&
    ((p.target.accountId && accountId && p.target.accountId === accountId) || (p.target.deviceId && deviceId && p.target.deviceId === deviceId))
  );
}

export function getActivePunishments({ accountId, deviceId }) {
  const now = Date.now();
  let changed = false;
  for (const p of state.punishments) {
    if (p.active && p.expiresAt !== -1 && p.expiresAt <= now) { p.active = false; changed = true; }
  }
  if (changed) saveState();
  return state.punishments.filter((p) => punishmentMatches(p, { accountId, deviceId }));
}

export function punishmentSummaryForClient({ accountId, deviceId }) {
  return getActivePunishments({ accountId, deviceId }).map((p) => ({ id: p.id, type: p.type, reason: p.reason, createdAt: p.createdAt, expiresAt: p.expiresAt }));
}

export function hasActivePunishment(type, identity) {
  return getActivePunishments(identity).some((p) => p.type === type || (type === "ban" && p.type === "ban"));
}

export function listPunishments(activeOnly = true) {
  const rows = state.punishments.filter((p) => !activeOnly || punishmentMatches(p, p.target));
  if (!rows.length) return [activeOnly ? "No active punishments." : "No punishments."];
  return rows.slice().sort((a,b)=>b.createdAt-a.createdAt).map((p) => `${p.id} | ${p.active ? "active" : "inactive"} | ${p.type} | ${p.target.accountName || p.target.name || p.target.deviceId} | expires ${p.expiresAt === -1 ? "permanent" : new Date(p.expiresAt).toISOString()} | ${p.reason}`);
}

export function addPunishmentForTarget(target, type, duration, reason) {
  const punishment = createPunishment({ target, type, durationRaw: duration, reason, reportId: null, createdBy: "developer" });
  return { ok: true, punishment };
}

export function removePunishment(id) {
  const p = state.punishments.find((item) => item.id.toLowerCase() === String(id || "").toLowerCase());
  if (!p) return { ok: false, reason: "Punishment not found." };
  p.active = false;
  p.updatedAt = Date.now();
  saveState();
  return { ok: true, punishment: p };
}

export function submitAppeal({ punishmentId, identity, text }) {
  const p = state.punishments.find((item) => item.id === punishmentId && punishmentMatches(item, identity));
  if (!p) return { ok: false, reason: "Active punishment not found." };
  const appeal = {
    id: `APL-${String(state.appeals.length + 1).padStart(4, "0")}-${randomUUID().slice(0, 6).toUpperCase()}`,
    punishmentId,
    status: "open",
    accountId: identity.accountId || null,
    deviceId: identity.deviceId || null,
    text: cleanText(text, 1200),
    createdAt: Date.now()
  };
  state.appeals.push(appeal);
  saveState();
  return { ok: true, appeal };
}

export function listAppeals() {
  const open = state.appeals.filter((a) => a.status === "open");
  if (!open.length) return ["No open appeals."];
  return open.map((a) => `${a.id} | punishment ${a.punishmentId} | ${new Date(a.createdAt).toISOString()} | ${a.text.slice(0, 100)}`);
}

export function appealLines(id) {
  const a = state.appeals.find((item) => item.id.toLowerCase() === String(id || "").toLowerCase());
  if (!a) return { ok: false, lines: ["Appeal not found."] };
  return { ok: true, lines: [`Appeal ${a.id} | ${a.status}`, `Punishment: ${a.punishmentId}`, `Account: ${a.accountId || "guest"}`, `Device: ${a.deviceId || "none"}`, `Text: ${a.text}`] };
}

export function resolveAppeal(id, decision) {
  const a = state.appeals.find((item) => item.id.toLowerCase() === String(id || "").toLowerCase());
  if (!a) return { ok: false, reason: "Appeal not found." };
  const approve = ["approve", "accept", "yes", "true"].includes(String(decision || "").toLowerCase());
  a.status = approve ? "approved" : "denied";
  a.resolvedAt = Date.now();
  if (approve) removePunishment(a.punishmentId);
  state.appeals = state.appeals.filter((item) => item.id !== a.id);
  saveState();
  return { ok: true, appeal: a, approved: approve };
}

function pairKey(a, b) { return [a, b].sort().join("::"); }

export function getSocialState(accountId) {
  if (!accountId) return null;
  const friends = state.friendships.filter((f) => f.accounts.includes(accountId)).map((f) => {
    const otherId = f.accounts.find((id) => id !== accountId);
    const account = findAccountById(otherId);
    return { friendshipId: f.id, accountId: otherId, username: account?.username || otherId, profile: account?.profile || {}, createdAt: f.createdAt };
  });
  const requests = state.friendRequests.filter((r) => r.toAccountId === accountId && r.status === "pending").map((r) => ({ ...r, fromUsername: findAccountById(r.fromAccountId)?.username || "Unknown" }));
  const outgoingRequests = state.friendRequests.filter((r) => r.fromAccountId === accountId && r.status === "pending").map((r) => ({ ...r, toUsername: findAccountById(r.toAccountId)?.username || "Unknown" }));
  const messages = state.friendMessages.filter((m) => m.toAccountId === accountId || m.fromAccountId === accountId).slice(-120);
  const challenges = state.challenges.filter((c) => c.toAccountId === accountId && c.status === "pending");
  return { friends, requests, outgoingRequests, messages, challenges };
}

export function sendFriendRequest(fromAccountId, targetQuery) {
  const target = findAccount(targetQuery);
  if (!fromAccountId) return { ok: false, reason: "Log in first." };
  if (!target) return { ok: false, reason: "Account not found." };
  if (target.id === fromAccountId) return { ok: false, reason: "You cannot friend yourself." };
  const key = pairKey(fromAccountId, target.id);
  if (state.friendships.some((f) => f.key === key)) return { ok: false, reason: "Already friends." };
  let request = state.friendRequests.find((r) => r.key === key && r.status === "pending");
  if (!request) {
    request = { id: `FR-${randomUUID().slice(0, 8).toUpperCase()}`, key, fromAccountId, toAccountId: target.id, status: "pending", createdAt: Date.now() };
    state.friendRequests.push(request);
  }
  saveState();
  return { ok: true, request, targetAccount: publicAccount(target) };
}

export function respondFriendRequest(accountId, requestIdOrFrom, accept = true) {
  const query = String(requestIdOrFrom || "").toLowerCase();
  let request = state.friendRequests.find((r) => r.toAccountId === accountId && r.status === "pending" && (r.id.toLowerCase() === query || findAccountById(r.fromAccountId)?.usernameLower === query));
  if (!request) return { ok: false, reason: "Friend request not found." };
  request.status = accept ? "accepted" : "denied";
  request.respondedAt = Date.now();
  let friendship = null;
  if (accept) {
    friendship = { id: `F-${randomUUID().slice(0, 8).toUpperCase()}`, key: request.key, accounts: [request.fromAccountId, request.toAccountId], createdAt: Date.now() };
    if (!state.friendships.some((f) => f.key === friendship.key)) state.friendships.push(friendship);
  }
  saveState();
  return { ok: true, request, friendship };
}

export function sendFriendMessage(fromAccountId, toAccountId, body) {
  const key = pairKey(fromAccountId, toAccountId);
  if (!state.friendships.some((f) => f.key === key)) return { ok: false, reason: "You can only message friends." };
  const message = { id: `FM-${randomUUID().slice(0, 8).toUpperCase()}`, fromAccountId, toAccountId, body: cleanText(body, 1000), createdAt: Date.now() };
  state.friendMessages.push(message);
  state.friendMessages = state.friendMessages.slice(-2000);
  saveState();
  return { ok: true, message };
}

export function createChallenge(fromAccountId, targetQuery, options = {}) {
  const target = findAccount(targetQuery);
  if (!target) return { ok: false, reason: "Account not found." };
  const key = pairKey(fromAccountId, target.id);
  if (!state.friendships.some((f) => f.key === key)) return { ok: false, reason: "You can only challenge friends." };
  const challenge = { id: `CH-${randomUUID().slice(0, 8).toUpperCase()}`, fromAccountId, toAccountId: target.id, variant: options.variant || "normal", timeControl: options.timeControl || "rapid", status: "pending", createdAt: Date.now() };
  state.challenges.push(challenge);
  saveState();
  return { ok: true, challenge, targetAccount: publicAccount(target) };
}

export function respondChallenge(accountId, challengeId, accept) {
  const challenge = state.challenges.find((c) => c.id === challengeId && c.toAccountId === accountId && c.status === "pending");
  if (!challenge) return { ok: false, reason: "Challenge not found." };
  challenge.status = accept ? "accepted" : "denied";
  challenge.respondedAt = Date.now();
  saveState();
  return { ok: true, challenge };
}

function boardBucket(scope, variant) {
  const root = scope === "allTime" ? state.leaderboards.allTime : state.leaderboards.months[nowMonth()] || (state.leaderboards.months[nowMonth()] = {});
  if (!root[variant]) root[variant] = {};
  return root[variant];
}

function playerEntry(bucket, accountId) {
  if (!bucket[accountId]) bucket[accountId] = { elo: BASE_ELO, games: 0, wins: 0, losses: 0, draws: 0, peak: BASE_ELO };
  return bucket[accountId];
}

export function getElo(accountId, variant, scope = "month") {
  const bucket = scope === "allTime" ? boardBucket("allTime", variant) : boardBucket("month", variant);
  return playerEntry(bucket, accountId).elo;
}

export function recordLeaderboardGame(game) {
  if (!game || game.leaderboardRecorded) return false;
  if (!(game.status === "finished" || game.status === "abandoned")) return false;
  const white = game.players?.white?.accountId;
  const black = game.players?.black?.accountId;
  if (!white || !black) { game.leaderboardRecorded = true; return false; }
  const result = !game.winner ? "draw" : game.winner === "white" ? "white" : "black";
  updateEloPair(game.variant, white, black, result, game);
  updateEloPairAllTime(game.variant, white, black, result, game);
  game.leaderboardRecorded = true;
  saveState();
  return true;
}

function expectedScore(ratingA, ratingB) { return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400)); }

function updateEloPair(variant, whiteId, blackId, winner, game) {
  const bucket = boardBucket("month", variant);
  const w = playerEntry(bucket, whiteId);
  const b = playerEntry(bucket, blackId);
  applyElo(w, b, whiteId, blackId, winner, variant, game);
}

function updateEloPairAllTime(variant, whiteId, blackId, winner, game) {
  const bucket = boardBucket("allTime", variant);
  const w = playerEntry(bucket, whiteId);
  const b = playerEntry(bucket, blackId);
  applyElo(w, b, whiteId, blackId, winner, variant, game);
}

function applyElo(w, b, whiteId, blackId, winner, variant, game) {
  const wBefore = w.elo;
  const bBefore = b.elo;
  const wScore = winner === "white" ? 1 : winner === "black" ? 0 : 0.5;
  const bScore = 1 - wScore;
  const k = 28;
  const wExpected = expectedScore(wBefore, bBefore);
  const bExpected = expectedScore(bBefore, wBefore);
  let wDelta = Math.round(k * (wScore - wExpected));
  let bDelta = Math.round(k * (bScore - bExpected));
  if (winner === "white") wDelta += 10;
  if (winner === "black") bDelta += 10;
  w.elo = Math.max(100, wBefore + wDelta);
  b.elo = Math.max(100, bBefore + bDelta);
  w.peak = Math.max(w.peak || BASE_ELO, w.elo);
  b.peak = Math.max(b.peak || BASE_ELO, b.elo);
  for (const entry of [w,b]) entry.games += 1;
  if (winner === "white") { w.wins += 1; b.losses += 1; }
  else if (winner === "black") { b.wins += 1; w.losses += 1; }
  else { w.draws += 1; b.draws += 1; }
  recordAccountEloHistory(whiteId, { roomCode: game.roomCode, variant, before: wBefore, after: w.elo, delta: w.elo - wBefore, opponentId: blackId, at: Date.now() });
  recordAccountEloHistory(blackId, { roomCode: game.roomCode, variant, before: bBefore, after: b.elo, delta: b.elo - bBefore, opponentId: whiteId, at: Date.now() });
}

export function leaderboardLines(variant = "normal", scope = "month", limit = 100) {
  const data = getLeaderboard(variant, scope, limit);
  if (!data.entries.length) return [`No leaderboard entries for ${variant} (${scope}).`];
  return data.entries.map((entry, index) => `${index + 1}. ${entry.username} | elo ${entry.elo} | ${entry.games}G ${entry.wins}W ${entry.losses}L ${entry.draws}D | id ${entry.accountId}`);
}

export function getLeaderboard(variant = "normal", scope = "month", limit = 100) {
  const bucket = scope === "allTime" ? boardBucket("allTime", variant) : boardBucket("month", variant);
  const entries = Object.entries(bucket).map(([accountId, stat]) => {
    const account = findAccountById(accountId);
    return { accountId, username: account?.username || accountId, profile: account?.profile || {}, ...stat };
  }).sort((a,b)=>b.elo-a.elo).slice(0, limit);
  return { variant, scope, month: nowMonth(), entries };
}

export function publicProfile(query, viewerAccountId = null) {
  const account = findAccount(query);
  if (!account) return { ok: false, reason: "Account not found." };
  const stats = account.stats || { totalGames: 0, wins: 0, losses: 0, draws: 0, byVariant: {} };
  const ranks = {};
  for (const variant of Object.keys(stats.byVariant || {})) {
    const entries = getLeaderboard(variant, "month", 1000).entries;
    const rank = entries.findIndex((entry) => entry.accountId === account.id) + 1;
    ranks[variant] = rank || null;
  }
  return { ok: true, profile: { ...publicAccount(account), email: undefined, moderation: undefined, ranks, eloHistory: account.eloHistory || [] } };
}
