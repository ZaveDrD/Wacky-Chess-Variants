export const BOARD_SIZE = 8;

export const VARIANTS = {
  threeD: { id: "threeD", label: "3D Chess", boardMode: "3d" },
  normal: { id: "normal", label: "Normal Chess", boardMode: "2d" },
  chess960: { id: "chess960", label: "Chess960", boardMode: "2d" },
  crazyhouse: { id: "crazyhouse", label: "Crazyhouse", boardMode: "2d" },
  kingOfTheHill: { id: "kingOfTheHill", label: "King of the Hill", boardMode: "2d" },
  atomic: { id: "atomic", label: "Atomic Chess", boardMode: "2d" },
  nuke: { id: "nuke", label: "Nuke", boardMode: "2d" },
  tycoon: { id: "tycoon", label: "Tycoon", boardMode: "2d" }
};

export const TIME_CONTROLS = {
  classical: { id: "classical", label: "Classical", seconds: 30 * 60 },
  rapid: { id: "rapid", label: "Rapid", seconds: 10 * 60 },
  blitz: { id: "blitz", label: "Blitz", seconds: 5 * 60 },
  bullet: { id: "bullet", label: "Bullet", seconds: 60 }
};

const standardBackRank = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];

export function normaliseVariant(variantId) {
  return VARIANTS[variantId] ? variantId : "threeD";
}

export function is2DVariant(variantId) {
  return VARIANTS[variantId]?.boardMode === "2d";
}

export function normaliseTimeControl(timeControlId) {
  return TIME_CONTROLS[timeControlId] ? timeControlId : "rapid";
}

export function normaliseGameMode(gameMode) {
  return gameMode === "ai" ? "ai" : "online";
}

export function normaliseAIDifficulty(aiDifficulty) {
  return ["easy", "medium", "hard"].includes(aiDifficulty) ? aiDifficulty : "medium";
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
  const timeMs = TIME_CONTROLS[timeControl].seconds * 1000;
  const pieces = createInitialPieces(variant);

  return {
    roomCode,
    variant,
    variantName: VARIANTS[variant].label,
    boardMode: VARIANTS[variant].boardMode,
    timeControl,
    timeControlName: TIME_CONTROLS[timeControl].label,
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
    lastTurnStartedAt: null,
    timeout: false,
    createdAt: Date.now()
  };
}
