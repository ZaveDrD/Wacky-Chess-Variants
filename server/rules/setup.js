export const BOARD_SIZE = 8;

export const VARIANTS = {
  threeD: { id: "threeD", label: "3D Chess", boardMode: "3d" },
  normal: { id: "normal", label: "Normal Chess", boardMode: "2d" },
  chess960: { id: "chess960", label: "Chess960", boardMode: "2d" },
  crazyhouse: { id: "crazyhouse", label: "Crazyhouse", boardMode: "2d" },
  kingOfTheHill: { id: "kingOfTheHill", label: "King of the Hill", boardMode: "2d" },
  atomic: { id: "atomic", label: "Atomic Chess", boardMode: "2d" },
  nuke: { id: "nuke", label: "Nuke", boardMode: "2d" },
  tycoon: { id: "tycoon", label: "Tycoon", boardMode: "2d" },
  predict: { id: "predict", label: "Predict", boardMode: "2d" },
  scooby: { id: "scooby", label: "Scooby", boardMode: "2d" },
  threeCheck: { id: "threeCheck", label: "3-Check", boardMode: "2d" },
  antichess: { id: "antichess", label: "Anti-Chess", boardMode: "2d" },
  anarchy: { id: "anarchy", label: "Anarchy Chess", boardMode: "2d" },
  ruleLab: { id: "ruleLab", label: "Rule Lab", boardMode: "2d" }
};

export const TIME_CONTROLS = {
  unlimited: { id: "unlimited", label: "Unlimited", seconds: null, incrementSeconds: 0, category: "Casual", aliases: ["none", "infinite", "infinity", "no-clock", "noclock", "untimed"] },
  bullet: { id: "bullet", label: "Bullet 1+0", seconds: 60, incrementSeconds: 0, category: "Bullet", aliases: ["1+0", "1|0", "1/0", "1m", "1min"] },
  bullet1_1: { id: "bullet1_1", label: "Bullet 1+1", seconds: 60, incrementSeconds: 1, category: "Bullet", aliases: ["1+1", "1|1", "1/1"] },
  bullet2_1: { id: "bullet2_1", label: "Bullet 2+1", seconds: 2 * 60, incrementSeconds: 1, category: "Bullet", aliases: ["2+1", "2|1", "2/1"] },
  blitz3: { id: "blitz3", label: "Blitz 3+0", seconds: 3 * 60, incrementSeconds: 0, category: "Blitz", aliases: ["3+0", "3|0", "3/0"] },
  blitz3_2: { id: "blitz3_2", label: "Blitz 3+2", seconds: 3 * 60, incrementSeconds: 2, category: "Blitz", aliases: ["3+2", "3|2", "3/2"] },
  blitz: { id: "blitz", label: "Blitz 5+0", seconds: 5 * 60, incrementSeconds: 0, category: "Blitz", aliases: ["5+0", "5|0", "5/0", "5m", "5min"] },
  blitz5_3: { id: "blitz5_3", label: "Blitz 5+3", seconds: 5 * 60, incrementSeconds: 3, category: "Blitz", aliases: ["5+3", "5|3", "5/3"] },
  rapid: { id: "rapid", label: "Rapid 10+0", seconds: 10 * 60, incrementSeconds: 0, category: "Rapid", aliases: ["10+0", "10|0", "10/0", "10m", "10min"] },
  rapid10_5: { id: "rapid10_5", label: "Rapid 10+5", seconds: 10 * 60, incrementSeconds: 5, category: "Rapid", aliases: ["10+5", "10|5", "10/5"] },
  rapid15_10: { id: "rapid15_10", label: "Rapid 15+10", seconds: 15 * 60, incrementSeconds: 10, category: "Rapid", aliases: ["15+10", "15|10", "15/10"] },
  rapid30: { id: "rapid30", label: "Rapid 30+0", seconds: 30 * 60, incrementSeconds: 0, category: "Rapid", aliases: ["30+0", "30|0", "30/0", "30m"] },
  classical: { id: "classical", label: "Classical 30+20", seconds: 30 * 60, incrementSeconds: 20, category: "Classical", aliases: ["30+20", "30|20", "30/20"] },
  classical45_45: { id: "classical45_45", label: "Classical 45+45", seconds: 45 * 60, incrementSeconds: 45, category: "Classical", aliases: ["45+45", "45|45", "45/45"] },
  classical60: { id: "classical60", label: "Classical 60+0", seconds: 60 * 60, incrementSeconds: 0, category: "Classical", aliases: ["60+0", "60|0", "60/0", "60m", "1h"] },
  classical90_30: { id: "classical90_30", label: "Classical 90+30", seconds: 90 * 60, incrementSeconds: 30, category: "Classical", aliases: ["90+30", "90|30", "90/30"] }
};

export function timeControlAliases() {
  const aliases = new Map();
  for (const [id, control] of Object.entries(TIME_CONTROLS)) {
    aliases.set(id.toLowerCase(), id);
    aliases.set(String(control.label || id).toLowerCase().replace(/[\s_-]+/g, ""), id);
    for (const alias of control.aliases || []) aliases.set(String(alias).toLowerCase().replace(/[\s_-]+/g, ""), id);
  }
  aliases.set("classic", "classical");
  aliases.set("standard", "rapid");
  aliases.set("noincrement", "rapid");
  return aliases;
}

export const RULE_LAB_DIFFICULTIES = {
  easy: { id: "easy", label: "Easy", rules: 2, clueEveryMs: 3 * 60 * 1000, wrongGuessPenaltyMs: 0, winBase: 10 },
  medium: { id: "medium", label: "Medium", rules: 3, clueEveryMs: 4 * 60 * 1000, wrongGuessPenaltyMs: 15 * 1000, winBase: 20 },
  hard: { id: "hard", label: "Hard", rules: 4, clueEveryMs: 5 * 60 * 1000, wrongGuessPenaltyMs: 30 * 1000, winBase: 35 },
  chaos: { id: "chaos", label: "Chaos", rules: 5, clueEveryMs: 5 * 60 * 1000, wrongGuessPenaltyMs: 45 * 1000, winBase: 50 }
};

const standardBackRank = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];

export function normaliseVariant(variantId) {
  return VARIANTS[variantId] ? variantId : "threeD";
}

export function is2DVariant(variantId) {
  return VARIANTS[variantId]?.boardMode === "2d";
}

export function normaliseTimeControl(timeControlId) {
  const raw = String(timeControlId || "").trim();
  if (TIME_CONTROLS[raw]) return raw;
  const key = raw.toLowerCase().replace(/[\s_-]+/g, "");
  return timeControlAliases().get(key) || "rapid";
}

export function normaliseGameMode(gameMode) {
  return gameMode === "ai" ? "ai" : "online";
}

export function normaliseAIDifficulty(aiDifficulty) {
  return ["easy", "medium", "hard"].includes(aiDifficulty) ? aiDifficulty : "medium";
}

export function normaliseRuleLabDifficulty(difficulty) {
  return RULE_LAB_DIFFICULTIES[difficulty] ? difficulty : "medium";
}

export function createInitialPieces(variant = "normal") {
  const pieces = [];
  const backRank = variant === "chess960" ? createChess960BackRank() : standardBackRank;

  for (let x = 0; x < BOARD_SIZE; x += 1) {
    pieces.push({ id: `white_${backRank[x]}_${x}`, type: backRank[x], color: "white", x, y: 0, z: 0, hasMoved: false });
    pieces.push({ id: `white_pawn_${x}`, type: "pawn", color: "white", x, y: 0, z: 1, hasMoved: false });
    pieces.push({ id: `black_${backRank[x]}_${x}`, type: backRank[x], color: "black", x, y: 0, z: 7, hasMoved: false });
    pieces.push({ id: `black_pawn_${x}`, type: "pawn", color: "black", x, y: 0, z: 6, hasMoved: false });
  }

  return pieces;
}

function createChess960BackRank() {
  const squares = Array(8).fill(null);
  const darkSquares = [0, 2, 4, 6];
  const lightSquares = [1, 3, 5, 7];
  squares[pick(darkSquares)] = "bishop";
  squares[pick(lightSquares)] = "bishop";
  squares[pick(openSquares(squares))] = "queen";
  squares[pick(openSquares(squares))] = "knight";
  squares[pick(openSquares(squares))] = "knight";
  const remaining = openSquares(squares).sort((a, b) => a - b);
  squares[remaining[0]] = "rook";
  squares[remaining[1]] = "king";
  squares[remaining[2]] = "rook";
  return squares;
}

function openSquares(squares) {
  return squares.map((piece, index) => piece ? null : index).filter((index) => index !== null);
}

function pick(values) {
  const index = Math.floor(Math.random() * values.length);
  const [value] = values.splice(index, 1);
  return value;
}

export function createGame(roomCode, options = {}) {
  const variant = normaliseVariant(options.variant);
  const timeControl = normaliseTimeControl(options.timeControl);
  const gameMode = normaliseGameMode(options.gameMode);
  const ruleLabDifficulty = normaliseRuleLabDifficulty(options.ruleLabDifficulty || options.difficulty);
  const selectedControl = TIME_CONTROLS[timeControl];
  const timeMs = variant === "ruleLab" ? 15 * 60 * 1000 : selectedControl.seconds == null ? null : selectedControl.seconds * 1000;
  const incrementMs = variant === "ruleLab" ? 0 : Number(selectedControl.incrementSeconds || 0) * 1000;
  const pieces = createInitialPieces(variant);

  return {
    roomCode,
    variant,
    variantName: VARIANTS[variant].label,
    boardMode: VARIANTS[variant].boardMode,
    timeControl,
    timeControlName: variant === "ruleLab" ? `${RULE_LAB_DIFFICULTIES[ruleLabDifficulty].label} difficulty` : selectedControl.label,
    incrementMs,
    unlimitedTime: variant !== "ruleLab" && selectedControl.seconds == null,
    ruleLabDifficulty,
    gameMode,
    ai: {
      enabled: gameMode === "ai",
      color: "black",
      colors: gameMode === "ai" ? ["black"] : [],
      difficulty: normaliseAIDifficulty(options.aiDifficulty),
      delayMs: 650,
      thinking: false
    },
    players: { white: null, black: null },
    spectators: [],
    turn: "white",
    status: "waiting",
    winner: null,
    message: "Waiting for opponent.",
    pieces,
    initialPieces: pieces.map((piece) => ({ ...piece })),
    reserves: variant === "crazyhouse" ? { white: [], black: [] } : null,
    nuke: variant === "nuke" ? {
      white: { charge: 0, active: null },
      black: { charge: 0, active: null }
    } : null,
    tycoon: variant === "tycoon" ? {
      money: { white: 0, black: 0 },
      maxMoney: { white: 15, black: 15 },
      production: { white: 0, black: 0 },
      storageLevel: { white: 0, black: 0 },
      productionLevel: { white: 0, black: 0 },
      walls: { white: 0, black: 0 },
      bombs: [],
      lastIncome: { white: 0, black: 0 }
    } : null,
    predict: variant === "predict" ? {
      round: 1,
      pending: { white: null, black: null }
    } : null,
    scooby: variant === "scooby" ? {
      traps: [],
      smokes: [],
      trapLimits: { mine: 1, pitfall: 2, smoke: 1, decoy: 2, mindControl: 1 }
    } : null,
    threeCheck: variant === "threeCheck" ? { checks: { white: 0, black: 0 }, target: 3 } : null,
    anarchy: variant === "anarchy" ? {
      events: [],
      specialEvents: 0,
      fires: [],
      responses: [],
      zombies: [],
      vacations: {},
      queenCompensation: { white: false, black: false },
      pendingBoost: null,
      checkPressure: null
    } : null,
    ruleLab: variant === "ruleLab" ? createRuleLabState(ruleLabDifficulty) : null,
    effects: { explosions: [], income: [] },
    turnToken: 0,
    moveHistory: [],
    positionHistory: [],
    positionCounts: {},
    halfmoveClock: 0,
    chat: [],
    lastMove: null,
    check: null,
    checkmate: false,
    stalemate: false,
    clocks: { white: timeMs, black: timeMs },
    clockInitialMs: timeMs,
    timerStarted: false,
    clockWaitingForBothPlayers: false,
    firstMoveMadeBy: { white: false, black: false },
    clocksStartedAt: null,
    lastTurnStartedAt: null,
    timeout: false,
    createdAt: Date.now()
  };
}


const RULE_LAB_RULE_POOL = [
  { id: "knight_echo", name: "Knight Echo", subject: "knights", verb: "cause", effect: "nearby friendly pawns to advance", difficulty: "easy", clue: "One hidden rule involves knights helping pawns.", summary: "When a knight moves, the nearest friendly pawn may advance." },
  { id: "heavy_rooks", name: "Heavy Rooks", subject: "rooks", verb: "are", effect: "limited to short moves", difficulty: "easy", clue: "One hidden rule limits a major piece's distance.", summary: "Rooks can only move up to 3 squares." },
  { id: "fragile_queens", name: "Fragile Queens", subject: "queens", verb: "are", effect: "destroyed after capturing", difficulty: "easy", clue: "One hidden rule punishes queen captures.", summary: "Queens vanish after capturing." },
  { id: "mirror_pawns", name: "Mirror Pawns", subject: "pawns", verb: "cause", effect: "opposite pawns to copy movement", difficulty: "easy", clue: "One hidden rule mirrors pawn movement.", summary: "When a pawn moves, the opposite pawn on the file may move too." },
  { id: "colourbound_curse", name: "Colourbound Curse", subject: "dark-square pieces", verb: "cannot", effect: "capture enemy pieces", difficulty: "medium", clue: "One hidden rule cares about square colour.", summary: "Pieces on dark squares cannot capture." },
  { id: "bishop_portals", name: "Bishop Portals", subject: "bishops", verb: "do", effect: "teleport through centre squares", difficulty: "medium", clue: "One hidden rule involves bishops and the centre.", summary: "Bishops reaching the centre teleport across it." },
  { id: "pawn_infection", name: "Pawn Infection", subject: "pawn captures", verb: "cause", effect: "nearby enemy pawns to disappear", difficulty: "medium", clue: "One hidden rule triggers after pawn captures.", summary: "Pawn captures remove nearby enemy pawns." },
  { id: "delayed_capture", name: "Delayed Capture", subject: "captures", verb: "are", effect: "delayed before fully resolving", difficulty: "medium", clue: "One hidden rule delays consequences of captures.", summary: "Captures are logged as delayed anomalies." },
  { id: "parity_law", name: "Parity Law", subject: "turn number", verb: "changes", effect: "which square colours are stable", difficulty: "hard", clue: "One hidden rule depends on odd and even turns.", summary: "Turn parity affects which square colours are stable." },
  { id: "gravity_file", name: "Gravity File", subject: "one file", verb: "causes", effect: "pieces to slide downward", difficulty: "hard", clue: "One hidden rule pulls pieces along a file.", summary: "One hidden file has gravity-like movement." },
  { id: "memory_board", name: "Memory Board", subject: "the board", verb: "remembers", effect: "recently occupied squares", difficulty: "hard", clue: "One hidden rule remembers previous board states.", summary: "The board remembers where pieces recently stood." },
  { id: "board_decay", name: "Board Decay", subject: "empty squares", verb: "become", effect: "unstable over time", difficulty: "chaos", clue: "One hidden rule changes the board itself.", summary: "Some empty squares become unstable over time." }
];

function createRuleLabState(difficultyId) {
  const difficulty = RULE_LAB_DIFFICULTIES[difficultyId] || RULE_LAB_DIFFICULTIES.medium;
  const allowed = RULE_LAB_RULE_POOL.filter((rule) => {
    if (difficultyId === "easy") return rule.difficulty === "easy";
    if (difficultyId === "medium") return ["easy", "medium"].includes(rule.difficulty);
    if (difficultyId === "hard") return ["easy", "medium", "hard"].includes(rule.difficulty);
    return true;
  });
  const shuffled = [...allowed].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, difficulty.rules);
  return {
    difficulty: difficultyId,
    ruleTarget: difficulty.rules,
    startedAt: Date.now(),
    endsAt: Date.now() + 15 * 60 * 1000,
    wrongGuessPenaltyMs: difficulty.wrongGuessPenaltyMs,
    winBase: difficulty.winBase,
    hiddenRules: selected.map((rule) => rule.id),
    ruleNames: selected.map((rule) => rule.name),
    discovered: [],
    guesses: [],
    clues: selected.map((rule, index) => ({ id: rule.id, clue: rule.clue, revealed: index === 0, at: index === 0 ? Date.now() : null })),
    anomalyLog: [{ at: Date.now(), text: `Rule Lab started: find ${difficulty.rules} hidden rules in 15 minutes.` }],
    availableGuesses: RULE_LAB_RULE_POOL.map(({ id, subject, verb, effect, difficulty }) => ({ id, subject, verb, effect, difficulty }))
  };
}
