import fs from "fs";
import path from "path";
import { randomBytes, randomUUID, pbkdf2Sync, timingSafeEqual, createHash } from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ACCOUNT_STORE_VERSION = 1;
const PASSWORD_ITERATIONS = 210000;
const SESSION_DAYS = 30;
const DEFAULT_STORE_PATH = path.join(__dirname, "data", "accounts.json");
const STORE_PATH = process.env.ACCOUNT_STORE_PATH || DEFAULT_STORE_PATH;

let state = loadState();

function loadState() {
  try {
    if (!fs.existsSync(STORE_PATH)) return makeEmptyState();
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    return migrateState(raw);
  } catch (error) {
    console.error(`[accounts] failed to load account store: ${error.message}`);
    return makeEmptyState();
  }
}

function makeEmptyState() {
  return { schemaVersion: ACCOUNT_STORE_VERSION, accounts: [], sessions: [], auditLog: [] };
}

function migrateState(raw) {
  const next = raw && typeof raw === "object" ? raw : makeEmptyState();
  if (!Array.isArray(next.accounts)) next.accounts = [];
  if (!Array.isArray(next.sessions)) next.sessions = [];
  if (!Array.isArray(next.auditLog)) next.auditLog = [];
  next.schemaVersion = ACCOUNT_STORE_VERSION;
  for (const account of next.accounts) {
    account.schemaVersion = account.schemaVersion || 1;
    account.stats = account.stats || makeEmptyStats();
    account.gameHistory = Array.isArray(account.gameHistory) ? account.gameHistory : [];
    account.flags = account.flags || {};
    account.updatedAt = account.updatedAt || account.createdAt || Date.now();
  }
  return next;
}

function saveState() {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  const tmp = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STORE_PATH);
}

function makeEmptyStats() {
  return { totalGames: 0, wins: 0, losses: 0, draws: 0, byVariant: {} };
}

function normaliseEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normaliseUsername(username) {
  return String(username || "").trim();
}

function usernameKey(username) {
  return normaliseUsername(username).toLowerCase();
}

function hashToken(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

function hashPassword(password, salt = randomBytes(24).toString("hex")) {
  const hash = pbkdf2Sync(String(password), salt, PASSWORD_ITERATIONS, 32, "sha256").toString("hex");
  return { algorithm: "pbkdf2-sha256", iterations: PASSWORD_ITERATIONS, salt, hash };
}

function verifyPassword(password, passwordHash) {
  if (!passwordHash?.hash || !passwordHash?.salt) return false;
  const next = pbkdf2Sync(String(password), passwordHash.salt, passwordHash.iterations || PASSWORD_ITERATIONS, 32, "sha256").toString("hex");
  try {
    return timingSafeEqual(Buffer.from(next, "hex"), Buffer.from(passwordHash.hash, "hex"));
  } catch {
    return false;
  }
}

function validateAccountInput({ email, username, password }, requirePassword = true) {
  const cleanEmail = normaliseEmail(email);
  const cleanUsername = normaliseUsername(username);
  if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) return "Enter a valid email address.";
  if (!/^[a-zA-Z0-9_-]{3,24}$/.test(cleanUsername)) return "Username must be 3-24 characters using letters, numbers, _ or -.";
  if (requirePassword && String(password || "").length < 8) return "Password must be at least 8 characters.";
  return null;
}

export function createAccount({ email, username, password }) {
  const reason = validateAccountInput({ email, username, password }, true);
  if (reason) return { ok: false, reason };
  const cleanEmail = normaliseEmail(email);
  const cleanUsername = normaliseUsername(username);
  const key = usernameKey(cleanUsername);
  if (state.accounts.some((account) => account.emailLower === cleanEmail)) return { ok: false, reason: "That email is already registered." };
  if (state.accounts.some((account) => account.usernameLower === key)) return { ok: false, reason: "That username is already taken." };

  const now = Date.now();
  const account = {
    schemaVersion: 1,
    id: `acct_${randomUUID()}`,
    email: cleanEmail,
    emailLower: cleanEmail,
    username: cleanUsername,
    usernameLower: key,
    passwordHash: hashPassword(password),
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
    stats: makeEmptyStats(),
    gameHistory: [],
    flags: { disabled: false },
    profile: {}
  };
  state.accounts.push(account);
  const session = createSessionForAccount(account);
  state.auditLog.push({ type: "accountCreated", accountId: account.id, at: now });
  saveState();
  return { ok: true, account: publicAccount(account), token: session.token };
}

export function loginAccount({ login, password }) {
  const query = String(login || "").trim().toLowerCase();
  const account = state.accounts.find((item) => item.emailLower === query || item.usernameLower === query);
  if (!account || !verifyPassword(password, account.passwordHash)) return { ok: false, reason: "Invalid username/email or password." };
  if (account.flags?.disabled) return { ok: false, reason: "This account is disabled." };
  account.lastLoginAt = Date.now();
  account.updatedAt = Date.now();
  const session = createSessionForAccount(account);
  saveState();
  return { ok: true, account: publicAccount(account), token: session.token };
}

function createSessionForAccount(account) {
  const token = `tcl_${randomBytes(32).toString("hex")}`;
  const now = Date.now();
  const session = {
    id: `sess_${randomUUID()}`,
    accountId: account.id,
    tokenHash: hashToken(token),
    createdAt: now,
    expiresAt: now + SESSION_DAYS * 24 * 60 * 60 * 1000
  };
  state.sessions.push(session);
  pruneExpiredSessions();
  return { token, session };
}

function pruneExpiredSessions(now = Date.now()) {
  state.sessions = state.sessions.filter((session) => session.expiresAt > now);
}

export function logoutAccount(token) {
  const tokenHash = hashToken(token);
  const before = state.sessions.length;
  state.sessions = state.sessions.filter((session) => session.tokenHash !== tokenHash);
  if (state.sessions.length !== before) saveState();
  return { ok: true };
}

export function getAccountByToken(token) {
  pruneExpiredSessions();
  if (!token) return null;
  const tokenHash = hashToken(token);
  const session = state.sessions.find((item) => item.tokenHash === tokenHash && item.expiresAt > Date.now());
  if (!session) return null;
  const account = state.accounts.find((item) => item.id === session.accountId);
  if (!account || account.flags?.disabled) return null;
  return account;
}

export function getPublicAccountByToken(token) {
  const account = getAccountByToken(token);
  return account ? publicAccount(account) : null;
}

export function publicAccount(account) {
  if (!account) return null;
  return {
    id: account.id,
    username: account.username,
    email: account.email,
    createdAt: account.createdAt,
    lastLoginAt: account.lastLoginAt,
    stats: account.stats || makeEmptyStats()
  };
}

export function participantAccount(account) {
  if (!account) return null;
  return { id: account.id, username: account.username };
}

export function getAccountLabelForSocketAccount(account) {
  return account?.username || null;
}

export function findAccount(queryRaw) {
  const query = String(queryRaw || "").trim().toLowerCase();
  if (!query) return null;
  return state.accounts.find((account) => account.id.toLowerCase() === query || account.usernameLower === query || account.emailLower === query || account.usernameLower.includes(query) || account.emailLower.includes(query)) || null;
}

export function getAccountInfoLines(queryRaw) {
  const account = findAccount(queryRaw);
  if (!account) return { ok: false, lines: ["Account not found."] };
  const stats = account.stats || makeEmptyStats();
  const byVariant = Object.entries(stats.byVariant || {}).map(([variant, item]) => `${variant}: ${item.games || 0}G ${item.wins || 0}W ${item.losses || 0}L ${item.draws || 0}D`).join(" | ") || "none";
  return {
    ok: true,
    lines: [
      `Account: ${account.username}`,
      `ID: ${account.id}`,
      `Email: ${account.email}`,
      `Created: ${new Date(account.createdAt).toISOString()}`,
      `Last login: ${account.lastLoginAt ? new Date(account.lastLoginAt).toISOString() : "never"}`,
      `Games: ${stats.totalGames || 0} | Wins: ${stats.wins || 0} | Losses: ${stats.losses || 0} | Draws: ${stats.draws || 0}`,
      `By mode: ${byVariant}`,
      `Recent games: ${(account.gameHistory || []).slice(-5).map((game) => `${game.roomCode}:${game.variant}:${game.result}`).join(", ") || "none"}`
    ]
  };
}

export function getAccountListLines(limitRaw = 25) {
  const limit = Math.min(100, Math.max(1, Number.parseInt(limitRaw, 10) || 25));
  if (!state.accounts.length) return ["No accounts registered."];
  return state.accounts.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, limit).map((account) => `${account.username} | ${account.email} | games ${account.stats?.totalGames || 0} | id ${account.id}`);
}

export function recordCompletedGameForAccounts(game) {
  if (!game || game.accountStatsRecorded) return false;
  if (!(game.status === "finished" || game.status === "abandoned")) return false;
  const now = Date.now();
  const entries = [];
  for (const color of ["white", "black"]) {
    const player = game.players?.[color];
    if (!player?.accountId) continue;
    const account = state.accounts.find((item) => item.id === player.accountId);
    if (!account) continue;
    const result = !game.winner ? "draw" : game.winner === color ? "win" : "loss";
    entries.push({ account, color, result, player });
  }
  if (!entries.length) {
    game.accountStatsRecorded = true;
    return false;
  }
  for (const { account, color, result } of entries) {
    if ((account.gameHistory || []).some((entry) => entry.roomCode === game.roomCode)) continue;
    if (!account.stats) account.stats = makeEmptyStats();
    if (!account.stats.byVariant) account.stats.byVariant = {};
    if (!account.stats.byVariant[game.variant]) account.stats.byVariant[game.variant] = { games: 0, wins: 0, losses: 0, draws: 0 };
    const stats = account.stats;
    const variantStats = stats.byVariant[game.variant];
    stats.totalGames += 1;
    variantStats.games += 1;
    if (result === "win") { stats.wins += 1; variantStats.wins += 1; }
    else if (result === "loss") { stats.losses += 1; variantStats.losses += 1; }
    else { stats.draws += 1; variantStats.draws += 1; }
    account.gameHistory.push({
      roomCode: game.roomCode,
      variant: game.variant,
      variantName: game.variantName,
      color,
      result,
      opponent: game.players?.[color === "white" ? "black" : "white"]?.name || "open",
      winner: game.winner || null,
      endedAt: now,
      moves: game.moveHistory?.length || 0
    });
    account.gameHistory = account.gameHistory.slice(-250);
    account.updatedAt = now;
  }
  game.accountStatsRecorded = true;
  saveState();
  return true;
}

export function isRegisteredUsername(username) {
  const key = usernameKey(username);
  if (!key) return false;
  return state.accounts.some((account) => account.usernameLower === key);
}

export function accountStorePath() {
  return STORE_PATH;
}
