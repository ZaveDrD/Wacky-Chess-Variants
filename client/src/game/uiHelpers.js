// Shared UI/helper utilities extracted from App.jsx to keep the main component smaller.

export function profileIconUrl(icon) {
  return `/profile-icons/${encodeURIComponent(icon || "lab-pawn.svg")}`;
}

export function getModeStats(account, variant) {
  return account?.stats?.byVariant?.[variant] || { games: 0, wins: 0, losses: 0, draws: 0 };
}

export function formatModeStats(account, variant) {
  const stats = getModeStats(account, variant);
  return `${stats.games || 0}G · ${stats.wins || 0}W · ${stats.losses || 0}L · ${stats.draws || 0}D`;
}

export function formatDateShort(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatElapsed(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function getTimeControlDescription(id) {
  return {
    classical: "Slow, deliberate games for deeper testing.",
    rapid: "Balanced pace for most experiments.",
    blitz: "Fast games with enough time to think.",
    bullet: "Unstable speed tests. Expect chaos."
  }[id] || "Custom experiment pace.";
}

export function getAIDifficultyDescription(id) {
  return {
    easy: "Fast, light CPU use, good for testing rules.",
    medium: "More tactical and moderately heavier.",
    hard: "Deepest search, highest server load."
  }[id] || "Bot difficulty.";
}

export function getVariantCategory(id) {
  return {
    normal: "Classic",
    chess960: "Classic",
    crazyhouse: "Classic / Experimental",
    kingOfTheHill: "Experimental",
    atomic: "Chaos",
    threeD: "3D",
    nuke: "Chaos",
    tycoon: "Experimental",
    predict: "Experimental",
    scooby: "Party / Chaos"
  }[id] || "Experiment";
}

export function censorText(value) {
  const raw = String(value ?? "");
  const blocked = [
    "fuck", "shit", "cunt", "bitch", "bastard", "dick", "pussy", "asshole", "nigger", "nigga", "faggot", "retard", "slut", "whore", "kys"
  ];
  let output = raw;
  for (const word of blocked) {
    const pattern = new RegExp(`\\b${escapeRegExp(word)}\\b`, "gi");
    output = output.replace(pattern, (match) => "#".repeat(match.length));
  }
  return output;
}

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getViewportDevTouchZone(clientX, clientY) {
  const width = window.innerWidth || document.documentElement.clientWidth || 0;
  const height = window.innerHeight || document.documentElement.clientHeight || 0;
  if (!width || !height) return null;

  const shortest = Math.min(width, height);
  const cornerSize = Math.max(54, Math.min(104, shortest * 0.18));
  const centreSize = Math.max(74, Math.min(140, shortest * 0.24));
  const centreX = width / 2;
  const centreY = height / 2;

  if (clientX <= cornerSize && clientY <= cornerSize) return "topLeft";
  if (clientX >= width - cornerSize && clientY <= cornerSize) return "topRight";
  if (clientX <= cornerSize && clientY >= height - cornerSize) return "bottomLeft";
  if (clientX >= width - cornerSize && clientY >= height - cornerSize) return "bottomRight";

  if (Math.abs(clientX - centreX) <= centreSize / 2 && Math.abs(clientY - centreY) <= centreSize / 2) {
    return "centre";
  }

  return null;
}

export function parseDevLocation(args, startIndex = 0) {
  if (!Array.isArray(args) || args.length <= startIndex) return null;
  const first = String(args[startIndex] || "").trim();
  const chess = /^([a-h])([1-8])$/i.exec(first);
  if (chess) return { location: { x: chess[1].toLowerCase().charCodeAt(0) - 97, y: 0, z: Number(chess[2]) - 1 }, nextIndex: startIndex + 1 };
  const parts = first.replace(/[()\[\]{}]/g, "").split(/[,:/]/).map((part) => Number.parseInt(part.trim(), 10));
  if (parts.length === 3 && parts.every(Number.isInteger)) return { location: { x: parts[0], y: parts[1], z: parts[2] }, nextIndex: startIndex + 1 };
  if (args.length >= startIndex + 3) {
    const xyz = [args[startIndex], args[startIndex + 1], args[startIndex + 2]].map((part) => Number.parseInt(part, 10));
    if (xyz.every(Number.isInteger)) return { location: { x: xyz[0], y: xyz[1], z: xyz[2] }, nextIndex: startIndex + 3 };
  }
  return null;
}

export function coordText(coord) {
  return `(${coord.x},${coord.y},${coord.z})`;
}

export function hillSquares() {
  return [{ x: 3, y: 0, z: 3 }, { x: 4, y: 0, z: 3 }, { x: 3, y: 0, z: 4 }, { x: 4, y: 0, z: 4 }];
}

export function siloSquares() {
  return [
    { x: 1, y: 0, z: 3 }, { x: 1, y: 0, z: 4 }, { x: 2, y: 0, z: 3 }, { x: 2, y: 0, z: 4 },
    { x: 5, y: 0, z: 3 }, { x: 5, y: 0, z: 4 }, { x: 6, y: 0, z: 3 }, { x: 6, y: 0, z: 4 }
  ];
}

export function circularBlastSquares(centre, radius, game = null) {
  const squares = [];
  if (!centre) return squares;
  for (let x = 0; x < 8; x += 1) {
    for (let z = 0; z < 8; z += 1) {
      const dx = x - centre.x;
      const dz = z - centre.z;
      const pos = { x, y: 0, z };
      if (dx * dx + dz * dz <= radius * radius && !isClientNukeBlockedByRook(game, centre, pos)) squares.push(pos);
    }
  }
  return squares;
}

export function isClientNukeBlockedByRook(game, centre, target) {
  if (!game) return false;
  const sameFile = centre.x === target.x && centre.z !== target.z;
  const sameRank = centre.z === target.z && centre.x !== target.x;
  if (!sameFile && !sameRank) return false;
  const stepX = Math.sign(target.x - centre.x);
  const stepZ = Math.sign(target.z - centre.z);
  let x = centre.x + stepX;
  let z = centre.z + stepZ;
  while (x !== target.x || z !== target.z) {
    const blocker = (game.pieces || []).find((piece) => piece.x === x && piece.y === 0 && piece.z === z);
    if (blocker?.type === "rook") return true;
    x += stepX;
    z += stepZ;
  }
  return false;
}

export function squareBlastSquares(centre, radius) {
  const squares = [];
  if (!centre) return squares;
  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dz = -radius; dz <= radius; dz += 1) {
      const pos = { x: centre.x + dx, y: 0, z: centre.z + dz };
      if (pos.x >= 0 && pos.x < 8 && pos.z >= 0 && pos.z < 8) squares.push(pos);
    }
  }
  return squares;
}

export function countdownStage(targetTurn, turnToken) {
  const remaining = Math.max(0, Number(targetTurn || 0) - Number(turnToken || 0));
  if (remaining > 4) return "yellow";
  if (remaining > 2) return "orange";
  return "red";
}

export function getDisplayedClocks(game, now) {
  const clocks = { ...(game.clocks || { white: 0, black: 0 }) };
  if (game.status === "playing" && game.lastTurnStartedAt && clocks[game.turn] != null) {
    clocks[game.turn] = Math.max(0, clocks[game.turn] - Math.max(0, now - game.lastTurnStartedAt));
  }
  return clocks;
}

export function formatClock(ms) {
  const totalSeconds = Math.ceil(Math.max(0, ms || 0) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatChatTime(time) {
  const date = new Date(time || Date.now());
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function getClientMembership(game, socketId) {
  if (!game || !socketId) return null;
  if (game.players?.white?.id === socketId) return { role: "player", color: "white" };
  if (game.players?.black?.id === socketId) return { role: "player", color: "black" };
  if ((game.spectators || []).some((spectator) => spectator.id === socketId)) return { role: "spectator", color: "spectator" };
  return null;
}

export function layerLabel(view) {
  if (view === "XZ") return "Y layer";
  if (view === "XY") return "Z layer";
  return "X layer";
}

export function sameCoord(a, b) {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

export function key(coord) {
  return `${coord.x},${coord.y},${coord.z}`;
}

export function capitalise(value) {
  return String(value || "").slice(0, 1).toUpperCase() + String(value || "").slice(1);
}

export function parseCommandLine(raw) {
  const tokens = [];
  const pattern = /"([^"]*)"|'([^']*)'|\S+/g;
  let match;
  while ((match = pattern.exec(String(raw || ""))) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[0]);
  }
  return tokens;
}

export function shouldClearLocalSelection(previousGame, nextGame) {
  if (!previousGame || !nextGame) return true;
  if (previousGame.roomCode !== nextGame.roomCode) return true;
  if (previousGame.variant !== nextGame.variant) return true;
  if (previousGame.status !== nextGame.status) return true;
  if (previousGame.turn !== nextGame.turn) return true;

  const previousMoves = previousGame.moveHistory?.length || 0;
  const nextMoves = nextGame.moveHistory?.length || 0;
  if (previousMoves !== nextMoves) return true;

  const previousPieces = previousGame.pieces?.length || 0;
  const nextPieces = nextGame.pieces?.length || 0;
  if (previousPieces !== nextPieces) return true;

  return false;
}

export function isTurnOnlyMessage(message) {
  return /^(white|black) to move\.?$/i.test(String(message || "").trim());
}
