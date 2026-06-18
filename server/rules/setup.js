export const BOARD_SIZE = 8;

export const VARIANTS = {
  threeD: {
    id: "threeD",
    label: "3D Chess",
    boardMode: "3d"
  },
  normal: {
    id: "normal",
    label: "Normal Chess",
    boardMode: "2d"
  }
};

export const TIME_CONTROLS = {
  classical: { id: "classical", label: "Classical", seconds: 30 * 60 },
  rapid: { id: "rapid", label: "Rapid", seconds: 10 * 60 },
  blitz: { id: "blitz", label: "Blitz", seconds: 5 * 60 },
  bullet: { id: "bullet", label: "Bullet", seconds: 60 }
};

const backRank = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];

export function normaliseVariant(variantId) {
  return VARIANTS[variantId] ? variantId : "threeD";
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

export function createInitialPieces() {
  const pieces = [];

  for (let x = 0; x < BOARD_SIZE; x += 1) {
    pieces.push({
      id: `white_${backRank[x]}_${x}`,
      type: backRank[x],
      color: "white",
      x,
      y: 0,
      z: 0,
      hasMoved: false
    });
    pieces.push({
      id: `white_pawn_${x}`,
      type: "pawn",
      color: "white",
      x,
      y: 0,
      z: 1,
      hasMoved: false
    });

    pieces.push({
      id: `black_${backRank[x]}_${x}`,
      type: backRank[x],
      color: "black",
      x,
      y: 0,
      z: 7,
      hasMoved: false
    });
    pieces.push({
      id: `black_pawn_${x}`,
      type: "pawn",
      color: "black",
      x,
      y: 0,
      z: 6,
      hasMoved: false
    });
  }

  return pieces;
}

export function createGame(roomCode, options = {}) {
  const variant = normaliseVariant(options.variant);
  const timeControl = normaliseTimeControl(options.timeControl);
  const gameMode = normaliseGameMode(options.gameMode);
  const timeMs = TIME_CONTROLS[timeControl].seconds * 1000;

  return {
    roomCode,
    variant,
    variantName: VARIANTS[variant].label,
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
    players: {
      white: null,
      black: null
    },
    spectators: [],
    turn: "white",
    status: "waiting",
    winner: null,
    message: "Waiting for opponent.",
    pieces: createInitialPieces(),
    moveHistory: [],
    positionHistory: [],
    positionCounts: {},
    halfmoveClock: 0,
    chat: [],
    lastMove: null,
    check: null,
    checkmate: false,
    stalemate: false,
    clocks: {
      white: timeMs,
      black: timeMs
    },
    clockInitialMs: timeMs,
    lastTurnStartedAt: null,
    timeout: false,
    createdAt: Date.now()
  };
}
