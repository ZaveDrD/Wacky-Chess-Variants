import fs from "fs";
import path from "path";
import { randomBytes, randomUUID, pbkdf2Sync, timingSafeEqual, createHash } from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ACCOUNT_STORE_VERSION = 4;
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
  return { schemaVersion: ACCOUNT_STORE_VERSION, accounts: [], sessions: [], auditLog: [], rankTypes: defaultRankTypes() };
}

function migrateState(raw) {
  const next = raw && typeof raw === "object" ? raw : makeEmptyState();
  if (!Array.isArray(next.accounts)) next.accounts = [];
  if (!Array.isArray(next.sessions)) next.sessions = [];
  if (!Array.isArray(next.auditLog)) next.auditLog = [];
  next.rankTypes = normaliseRankTypes(next.rankTypes);
  ensureDefaultRankTypes(next.rankTypes);
  next.schemaVersion = ACCOUNT_STORE_VERSION;
  for (const account of next.accounts) {
    account.schemaVersion = account.schemaVersion || 1;
    account.stats = account.stats || makeEmptyStats();
    account.gameHistory = Array.isArray(account.gameHistory) ? account.gameHistory : [];
    account.flags = account.flags || {};
    account.profile = account.profile || {};
    account.profile.icon = normaliseProfileIcon(account.profile.icon || account.profileIcon || DEFAULT_PROFILE_ICON);
    account.profile.displayBio = String(account.profile.displayBio || "");
    account.ranks = Array.isArray(account.ranks) ? [...new Set(account.ranks.map(normaliseRankKey).filter(Boolean))] : [];
    account.badges = Array.isArray(account.badges) ? [...new Set(account.badges.map(normaliseBadgeId).filter(Boolean))] : [];
    account.profile.equippedBadge = normaliseBadgeId(account.profile.equippedBadge);
    if (account.profile.equippedBadge && !account.badges.includes(account.profile.equippedBadge)) account.profile.equippedBadge = null;
    account.moderation = account.moderation || {};
    account.moderation.credibility = Number.isFinite(Number(account.moderation.credibility)) ? Number(account.moderation.credibility) : 50;
    account.moderation.punishmentHistory = Array.isArray(account.moderation.punishmentHistory) ? account.moderation.punishmentHistory : [];
    account.eloHistory = Array.isArray(account.eloHistory) ? account.eloHistory : [];
    account.updatedAt = account.updatedAt || account.createdAt || Date.now();
  }
  return next;
}


function defaultRankTypes() {
  const now = Date.now();
  return [
    { key: "admin", name: "Admin", chatColour: "#facc15", badge: "admin.svg", consoleAccess: true, createdAt: now },
    { key: "moderator", name: "Moderator", chatColour: "#60a5fa", badge: "moderator.svg", consoleAccess: true, createdAt: now },
    { key: "supporter", name: "Supporter", chatColour: "#c084fc", badge: "supporter.svg", consoleAccess: false, createdAt: now }
  ];
}

function normaliseRankKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
}

function normaliseBadgeId(value) {
  const clean = String(value || "").trim().replace(/^Badge=/i, "");
  if (!clean || clean.toLowerCase() === "null" || clean.toLowerCase() === "none") return null;
  const fileLike = clean.replace(/\s+/g, "-");
  const withExt = /\.(svg|png|jpg|jpeg|webp)$/i.test(fileLike) ? fileLike : `${fileLike}.svg`;
  if (!/^[a-zA-Z0-9_.-]+\.(svg|png|jpg|jpeg|webp)$/i.test(withExt)) return null;
  return withExt;
}

function normaliseChatColour(value) {
  const clean = String(value || "").trim();
  if (!clean || clean.toLowerCase() === "null" || clean.toLowerCase() === "none") return null;
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(clean)) return clean;
  if (/^[a-zA-Z]{3,24}$/.test(clean)) return clean;
  return null;
}

function normaliseConsoleAccess(value) {
  if (typeof value === "boolean") return value;
  const clean = String(value ?? "false").trim().toLowerCase();
  return ["true", "1", "yes", "on", "console", "access"].includes(clean);
}

function normaliseRankTypes(rankTypes) {
  if (!Array.isArray(rankTypes)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of rankTypes) {
    const name = String(raw?.name || raw?.key || "").trim().slice(0, 32);
    const key = normaliseRankKey(raw?.key || name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      name: name || key,
      chatColour: normaliseChatColour(raw?.chatColour || raw?.chatColor) || null,
      badge: normaliseBadgeId(raw?.badge) || null,
      consoleAccess: normaliseConsoleAccess(raw?.consoleAccess),
      createdAt: Number(raw?.createdAt) || Date.now()
    });
  }
  return out;
}

function ensureDefaultRankTypes(rankTypes) {
  const defaults = defaultRankTypes();
  for (const rank of defaults) {
    if (!rankTypes.some((item) => item.key === rank.key)) rankTypes.push(rank);
  }
}

function findRankType(queryRaw) {
  const key = normaliseRankKey(queryRaw);
  return (state.rankTypes || []).find((rank) => rank.key === key || rank.name.toLowerCase() === String(queryRaw || "").trim().toLowerCase()) || null;
}

function getPublicRankSummaries(account) {
  const ranks = Array.isArray(account?.ranks) ? account.ranks : [];
  return ranks.map((rankKey) => findRankType(rankKey)).filter(Boolean).map((rank) => ({
    key: rank.key,
    name: rank.name,
    chatColour: rank.chatColour || null,
    badge: rank.badge || null,
    consoleAccess: Boolean(rank.consoleAccess)
  }));
}

export function accountHasConsoleAccess(account) {
  return getPublicRankSummaries(account).some((rank) => rank.consoleAccess);
}

export function getAccountChatColour(account) {
  const ranks = getPublicRankSummaries(account);
  const coloured = [...ranks].reverse().find((rank) => rank.chatColour);
  return coloured?.chatColour || null;
}

export function createRankType({ name, chatColour = null, badge = null, consoleAccess = false } = {}) {
  const cleanName = String(name || "").trim().slice(0, 32);
  const key = normaliseRankKey(cleanName);
  if (!key) return { ok: false, reason: "Usage: rank new [Name] [ChatColour] [Badge|null] [ConsoleAccess=false]" };
  if (findRankType(key)) return { ok: false, reason: "That rank already exists." };
  const rank = { key, name: cleanName, chatColour: normaliseChatColour(chatColour), badge: normaliseBadgeId(badge), consoleAccess: normaliseConsoleAccess(consoleAccess), createdAt: Date.now() };
  state.rankTypes.push(rank);
  state.auditLog.push({ type: "rankCreated", rank: key, at: Date.now() });
  saveState();
  return { ok: true, rank, lines: [`Created rank ${rank.name} | colour=${rank.chatColour || "none"} | badge=${rank.badge || "none"} | consoleAccess=${rank.consoleAccess}`] };
}

export function deleteRankType(queryRaw) {
  const rank = findRankType(queryRaw);
  if (!rank) return { ok: false, reason: "Rank not found." };
  state.rankTypes = state.rankTypes.filter((item) => item.key !== rank.key);
  for (const account of state.accounts) {
    account.ranks = (account.ranks || []).filter((item) => item !== rank.key);
    if (rank.badge && (account.badges || []).includes(rank.badge)) {
      const stillGrantedByRank = (account.ranks || []).some((key) => findRankType(key)?.badge === rank.badge);
      if (!stillGrantedByRank) account.badges = (account.badges || []).filter((badge) => badge !== rank.badge);
      if (account.profile?.equippedBadge === rank.badge && !(account.badges || []).includes(rank.badge)) account.profile.equippedBadge = null;
    }
  }
  state.auditLog.push({ type: "rankDeleted", rank: rank.key, at: Date.now() });
  saveState();
  return { ok: true, rank, lines: [`Deleted rank ${rank.name}.`] };
}

export function addRankToAccount(queryRaw, rankRaw) {
  const account = findAccount(queryRaw);
  if (!account) return { ok: false, reason: "Account not found." };
  const rank = findRankType(rankRaw);
  if (!rank) return { ok: false, reason: "Rank not found." };
  account.ranks = Array.isArray(account.ranks) ? account.ranks : [];
  if (!account.ranks.includes(rank.key)) account.ranks.push(rank.key);
  if (rank.badge) {
    account.badges = Array.isArray(account.badges) ? account.badges : [];
    if (!account.badges.includes(rank.badge)) account.badges.push(rank.badge);
    if (!account.profile?.equippedBadge) {
      account.profile = account.profile || {};
      account.profile.equippedBadge = rank.badge;
    }
  }
  account.updatedAt = Date.now();
  state.auditLog.push({ type: "rankGranted", accountId: account.id, rank: rank.key, at: Date.now() });
  saveState();
  return { ok: true, account: publicAccount(account), lines: [`Granted ${rank.name} to ${account.username}${rank.badge ? ` and granted badge ${rank.badge}` : ""}.`] };
}

export function removeRankFromAccount(queryRaw, rankRaw) {
  const account = findAccount(queryRaw);
  if (!account) return { ok: false, reason: "Account not found." };
  const rank = findRankType(rankRaw);
  if (!rank) return { ok: false, reason: "Rank not found." };
  account.ranks = (account.ranks || []).filter((item) => item !== rank.key);
  if (rank.badge) {
    const stillGrantedByRank = (account.ranks || []).some((key) => findRankType(key)?.badge === rank.badge);
    if (!stillGrantedByRank) account.badges = (account.badges || []).filter((badge) => badge !== rank.badge);
    if (account.profile?.equippedBadge === rank.badge && !(account.badges || []).includes(rank.badge)) account.profile.equippedBadge = null;
  }
  account.updatedAt = Date.now();
  state.auditLog.push({ type: "rankRevoked", accountId: account.id, rank: rank.key, at: Date.now() });
  saveState();
  return { ok: true, account: publicAccount(account), lines: [`Removed ${rank.name} from ${account.username}${rank.badge ? ` and revoked badge ${rank.badge}` : ""}.`] };
}

export function getRankListLines() {
  const ranks = normaliseRankTypes(state.rankTypes);
  if (!ranks.length) return ["No rank types configured."];
  return ranks.map((rank) => `${rank.name} | key=${rank.key} | colour=${rank.chatColour || "none"} | badge=${rank.badge || "none"} | consoleAccess=${rank.consoleAccess}`);
}

export function grantBadgeToAccount(queryRaw, badgeRaw) {
  const account = findAccount(queryRaw);
  if (!account) return { ok: false, reason: "Account not found." };
  const badge = normaliseBadgeId(badgeRaw);
  if (!badge) return { ok: false, reason: "Usage: badge grant [account] [badge-file]" };
  account.badges = Array.isArray(account.badges) ? account.badges : [];
  if (!account.badges.includes(badge)) account.badges.push(badge);
  account.profile = account.profile || {};
  if (!account.profile.equippedBadge) account.profile.equippedBadge = badge;
  account.updatedAt = Date.now();
  state.auditLog.push({ type: "badgeGranted", accountId: account.id, badge, at: Date.now() });
  saveState();
  return { ok: true, account: publicAccount(account), lines: [`Granted badge ${badge} to ${account.username}.`] };
}

export function revokeBadgeFromAccount(queryRaw, badgeRaw) {
  const account = findAccount(queryRaw);
  if (!account) return { ok: false, reason: "Account not found." };
  const badge = normaliseBadgeId(badgeRaw);
  if (!badge) return { ok: false, reason: "Usage: badge revoke [account] [badge-file]" };
  account.badges = (account.badges || []).filter((item) => item !== badge);
  if (account.profile?.equippedBadge === badge) account.profile.equippedBadge = null;
  account.updatedAt = Date.now();
  state.auditLog.push({ type: "badgeRevoked", accountId: account.id, badge, at: Date.now() });
  saveState();
  return { ok: true, account: publicAccount(account), lines: [`Revoked badge ${badge} from ${account.username}.`] };
}

export function equipBadgeForAccount(queryRaw, badgeRaw) {
  const account = findAccount(queryRaw);
  if (!account) return { ok: false, reason: "Account not found." };
  const badge = normaliseBadgeId(badgeRaw);
  account.profile = account.profile || {};
  if (!badge) {
    account.profile.equippedBadge = null;
  } else {
    if (!(account.badges || []).includes(badge)) return { ok: false, reason: "That badge has not been granted to this account." };
    account.profile.equippedBadge = badge;
  }
  account.updatedAt = Date.now();
  saveState();
  return { ok: true, account: publicAccount(account), lines: [`${account.username} equipped badge ${account.profile.equippedBadge || "none"}.`] };
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

const DEFAULT_PROFILE_ICON = "lab-pawn.svg";

function normaliseUsername(username) {
  return String(username || "").trim();
}

function normaliseProfileIcon(icon) {
  const clean = String(icon || DEFAULT_PROFILE_ICON).trim();
  if (!/^[a-zA-Z0-9_.-]+\.(svg|png|jpg|jpeg|webp)$/i.test(clean)) return DEFAULT_PROFILE_ICON;
  return clean;
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
    profile: { icon: DEFAULT_PROFILE_ICON, displayBio: "", equippedBadge: null },
    ranks: [],
    badges: [],
    moderation: { credibility: 50, punishmentHistory: [] },
    eloHistory: []
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
    profile: account.profile || { icon: DEFAULT_PROFILE_ICON, displayBio: "", equippedBadge: null },
    ranks: getPublicRankSummaries(account),
    badges: Array.isArray(account.badges) ? [...account.badges] : [],
    devConsoleAccess: accountHasConsoleAccess(account),
    chatColour: getAccountChatColour(account),
    stats: account.stats || makeEmptyStats(),
    gameHistory: Array.isArray(account.gameHistory) ? account.gameHistory.slice(-25) : [],
    eloHistory: Array.isArray(account.eloHistory) ? account.eloHistory.slice(-100) : []
  };
}

export function participantAccount(account) {
  if (!account) return null;
  return {
    id: account.id,
    username: account.username,
    profile: account.profile || { icon: DEFAULT_PROFILE_ICON, equippedBadge: null },
    ranks: getPublicRankSummaries(account),
    badges: Array.isArray(account.badges) ? [...account.badges] : [],
    devConsoleAccess: accountHasConsoleAccess(account),
    chatColour: getAccountChatColour(account)
  };
}

export function getAccountLabelForSocketAccount(account) {
  return account?.username || null;
}

export function findAccount(queryRaw) {
  const query = String(queryRaw || "").trim().toLowerCase();
  if (!query) return null;
  return state.accounts.find((account) => account.id.toLowerCase() === query || account.usernameLower === query || account.emailLower === query || account.usernameLower.includes(query) || account.emailLower.includes(query)) || null;
}

export function findAccountById(accountId) {
  const id = String(accountId || "").trim();
  if (!id) return null;
  return state.accounts.find((account) => account.id === id) || null;
}


export function updateAccount(token, updates = {}) {
  const account = getAccountByToken(token);
  if (!account) return { ok: false, reason: "Account session expired." };

  const now = Date.now();
  const nextUsername = updates.username !== undefined ? normaliseUsername(updates.username) : null;
  const nextEmail = updates.email !== undefined ? normaliseEmail(updates.email) : null;
  const nextPassword = updates.newPassword !== undefined ? String(updates.newPassword || "") : null;
  const changingSensitive = Boolean(nextEmail || nextPassword);

  if (changingSensitive) {
    if (!verifyPassword(updates.currentPassword, account.passwordHash)) return { ok: false, reason: "Current password is incorrect." };
  }

  if (nextUsername !== null && nextUsername !== account.username) {
    const reason = validateAccountInput({ email: account.email, username: nextUsername, password: "password-ok" }, false);
    if (reason) return { ok: false, reason };
    const key = usernameKey(nextUsername);
    if (state.accounts.some((item) => item.id !== account.id && item.usernameLower === key)) return { ok: false, reason: "That username is already taken." };
    account.username = nextUsername;
    account.usernameLower = key;
  }

  if (nextEmail !== null && nextEmail !== account.emailLower) {
    if (!/^\S+@\S+\.\S+$/.test(nextEmail)) return { ok: false, reason: "Enter a valid email address." };
    if (state.accounts.some((item) => item.id !== account.id && item.emailLower === nextEmail)) return { ok: false, reason: "That email is already registered." };
    account.email = nextEmail;
    account.emailLower = nextEmail;
  }

  if (nextPassword !== null && nextPassword.length) {
    if (nextPassword.length < 8) return { ok: false, reason: "Password must be at least 8 characters." };
    account.passwordHash = hashPassword(nextPassword);
  }

  if (updates.profileIcon !== undefined) {
    account.profile = account.profile || {};
    account.profile.icon = normaliseProfileIcon(updates.profileIcon);
  }

  if (updates.equippedBadge !== undefined) {
    account.profile = account.profile || {};
    const badgeId = normaliseBadgeId(updates.equippedBadge);
    if (!badgeId) account.profile.equippedBadge = null;
    else if ((account.badges || []).includes(badgeId)) account.profile.equippedBadge = badgeId;
    else return { ok: false, reason: "That badge has not been granted to this account." };
  }

  account.updatedAt = now;
  state.auditLog.push({ type: "accountUpdated", accountId: account.id, at: now, fields: Object.keys(updates).filter((key) => key !== "currentPassword" && key !== "newPassword") });
  saveState();
  return { ok: true, account: publicAccount(account) };
}

export function deleteAccount(queryRaw) {
  const account = findAccount(queryRaw);
  if (!account) return { ok: false, reason: "Account not found." };
  state.accounts = state.accounts.filter((item) => item.id !== account.id);
  state.sessions = state.sessions.filter((session) => session.accountId !== account.id);
  state.auditLog.push({ type: "accountDeleted", accountId: account.id, username: account.username, at: Date.now() });
  saveState();
  return { ok: true, account: publicAccount(account) };
}

export function devCreateAccount({ email, username, password }) {
  return createAccount({ email, username, password });
}

export function forceProfileIcon(queryRaw, icon) {
  const account = findAccount(queryRaw);
  if (!account) return { ok: false, reason: "Account not found." };
  account.profile = account.profile || {};
  account.profile.icon = normaliseProfileIcon(icon);
  account.updatedAt = Date.now();
  saveState();
  return { ok: true, account: publicAccount(account) };
}

export function wipeAccountData(queryRaw, mode = "game") {
  const account = findAccount(queryRaw);
  if (!account) return { ok: false, reason: "Account not found." };
  const wipeMode = String(mode || "game").toLowerCase();
  const now = Date.now();
  account.stats = makeEmptyStats();
  account.gameHistory = [];
  account.eloHistory = [];
  if (["all", "moderation", "full"].includes(wipeMode)) {
    account.moderation = { credibility: 50, punishmentHistory: [] };
  }
  account.updatedAt = now;
  state.auditLog.push({ type: "accountDataWiped", accountId: account.id, username: account.username, mode: wipeMode, at: now });
  saveState();
  return { ok: true, account: publicAccount(account), accountId: account.id, mode: wipeMode };
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
      `Profile icon: ${account.profile?.icon || DEFAULT_PROFILE_ICON}`,
      `Equipped badge: ${account.profile?.equippedBadge || "none"}`,
      `Badges: ${(account.badges || []).join(", ") || "none"}`,
      `Ranks: ${getPublicRankSummaries(account).map((rank) => `${rank.name}${rank.consoleAccess ? "*" : ""}`).join(", ") || "none"}`,
      `Created: ${new Date(account.createdAt).toISOString()}`,
      `Last login: ${account.lastLoginAt ? new Date(account.lastLoginAt).toISOString() : "never"}`,
      `Games: ${stats.totalGames || 0} | Wins: ${stats.wins || 0} | Losses: ${stats.losses || 0} | Draws: ${stats.draws || 0}`,
      `By mode: ${byVariant}`,
      `Credibility: ${account.moderation?.credibility ?? 50}`,
      `Punishment history: ${(account.moderation?.punishmentHistory || []).slice(-5).map((p) => `${p.type}:${p.reason}`).join(", ") || "none"}`,
      `Recent games: ${(account.gameHistory || []).slice(-5).map((game) => `${game.roomCode}:${game.variant}:${game.result}`).join(", ") || "none"}`
    ]
  };
}

export function getAccountListLines(limitRaw = 25) {
  const limit = Math.min(100, Math.max(1, Number.parseInt(limitRaw, 10) || 25));
  if (!state.accounts.length) return ["No accounts registered."];
  return state.accounts.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, limit).map((account) => `${account.username} | ${account.email} | created ${new Date(account.createdAt).toISOString()} | games ${account.stats?.totalGames || 0} | icon ${account.profile?.icon || DEFAULT_PROFILE_ICON} | badge ${account.profile?.equippedBadge || "none"} | ranks ${getPublicRankSummaries(account).map((r)=>r.name).join("+") || "none"} | id ${account.id}`);
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
    const result = game.winner === "both" ? "win" : (!game.winner ? "draw" : game.winner === color ? "win" : "loss");
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

export function adjustAccountCredibility(accountId, delta, reason = "") {
  const account = findAccountById(accountId);
  if (!account) return false;
  account.moderation = account.moderation || { credibility: 50, punishmentHistory: [] };
  const current = Number(account.moderation.credibility ?? 50);
  account.moderation.credibility = Math.max(0, Math.min(100, current + Number(delta || 0)));
  account.moderation.lastCredibilityChange = { delta: Number(delta || 0), reason: String(reason || ""), at: Date.now() };
  account.updatedAt = Date.now();
  saveState();
  return true;
}

export function recordAccountPunishment(accountId, punishment) {
  const account = findAccountById(accountId);
  if (!account) return false;
  account.moderation = account.moderation || { credibility: 50, punishmentHistory: [] };
  account.moderation.punishmentHistory = account.moderation.punishmentHistory || [];
  account.moderation.punishmentHistory.push({
    id: punishment.id,
    type: punishment.type,
    reason: punishment.reason,
    createdAt: punishment.createdAt,
    expiresAt: punishment.expiresAt,
    reportId: punishment.reportId || null
  });
  account.moderation.punishmentHistory = account.moderation.punishmentHistory.slice(-100);
  account.updatedAt = Date.now();
  saveState();
  return true;
}

export function recordAccountEloHistory(accountId, entry) {
  const account = findAccountById(accountId);
  if (!account) return false;
  account.eloHistory = Array.isArray(account.eloHistory) ? account.eloHistory : [];
  account.eloHistory.push({ ...entry, at: entry.at || Date.now() });
  account.eloHistory = account.eloHistory.slice(-500);
  account.updatedAt = Date.now();
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
