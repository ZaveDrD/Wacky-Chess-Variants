export const UI_TEXT = {
  siteTitle: "The Gallery Of Wacky Chess Variants",
  appTitle: "3D Chess",
  appSubtitle: "Pick a variant, choose a time control, and start a room.",
  lobby: {
    variantLabel: "Variant",
    timeControlLabel: "Time Control",
    gameModeLabel: "Game Mode",
    aiDifficultyLabel: "AI Difficulty",
    nameLabel: "Player Name",
    namePlaceholder: "Enter Name",
    hostButton: "Host Game",
    hostAIButton: "Start Vs AI",
    findMatchButton: "Find Match",
    cancelSearchButton: "Cancel Search",
    hostPrivateButton: "Host Private",
    joinButton: "Join",
    roomPlaceholder: "Room Code"
  },
  variants: {
    threeD: {
      label: "3D Chess",
      subtitle: "8×8×8 multiplayer chess with plane-based movement.",
      rules: [
        "Pieces move within one plane per move.",
        "Castling is only on the original board.",
        "Checkmate your opponent to win."
      ]
    },
    normal: {
      label: "Normal Chess",
      subtitle: "Standard chess on one 8×8 board.",
      rules: [
        "Pieces use standard chess movement.",
        "Checkmate your opponent to win."
      ]
    },
    chess960: {
      label: "Chess960",
      subtitle: "Normal chess, but the back-rank pieces start shuffled.",
      rules: [
        "The back rank is randomised using Chess960 rules.",
        "Bishops start on opposite-coloured squares.",
        "The king starts between the two rooks.",
        "Checkmate your opponent to win."
      ]
    },
    crazyhouse: {
      label: "Crazyhouse",
      subtitle: "Captured pieces become drops you can place back onto the board.",
      rules: [
        "When you capture a piece, it enters your reserve.",
        "On your turn, you may drop a reserve piece onto an empty square.",
        "Pawns cannot be dropped on the first or last rank.",
        "Checkmate your opponent to win."
      ]
    },
    kingOfTheHill: {
      label: "King of the Hill",
      subtitle: "Win by checkmate or by moving your king to the centre.",
      rules: [
        "The four centre squares are the hill.",
        "Move your king to d4, e4, d5, or e5 to win immediately.",
        "Checkmate still wins normally."
      ]
    },
    atomic: {
      label: "Atomic Chess",
      subtitle: "Captures explode nearby non-pawn pieces.",
      rules: [
        "Any capture creates an explosion on the capture square.",
        "The capturing piece, captured piece, and nearby non-pawn pieces are removed.",
        "Destroying the enemy king wins.",
        "Checkmate can still win normally."
      ]
    }
  },
  timeControls: {
    classical: "Classical",
    rapid: "Rapid",
    blitz: "Blitz",
    bullet: "Bullet"
  },
  gameModes: {
    online: "Online Multiplayer",
    ai: "Vs AI"
  },
  aiDifficulty: {
    easy: "Easy",
    medium: "Medium",
    hard: "Hard"
  },
  headings: {
    players: "Players",
    selected: "Selected",
    rules: "Rules",
    moveHistory: "Move History",
    viewControls: "View Controls",
    matchReview: "Match Review",
    chat: "Game Chat"
  },
  emptyStates: {
    noPieceSelected: "No Piece Selected.",
    noMovesYet: "No Moves Yet.",
    noSpectators: "No Spectators."
  },
  buttons: {
    returnHome: "Home",
    newRoom: "New Game",
    reviewMatch: "Spectate",
    closeOverlay: "Close Overlay",
    backMove: "‹ Back",
    nextMove: "Next ›",
    jumpStart: "Start",
    jumpEnd: "End",
    playReview: "Play",
    pauseReview: "Pause",
    exitReview: "Exit",
    forfeit: "Forfeit",
    confirmForfeit: "Confirm Forfeit",
    cancel: "Cancel",
    sendChat: "Send"
  },
  labels: {
    room: "Room",
    copied: "Copied",
    youAre: "You are",
    playing: "Playing",
    roleSpectator: "Spectator",
    turn: "Turn",
    review: "Review",
    move: "Move",
    layer: "Layer",
    waiting: "Waiting...",
    white: "White",
    black: "Black",
    spectators: "Spectators",
    chatPlaceholder: "Type Message..."
  },
  gameOver: {
    checkmateTitle: "Checkmate",
    stalemateTitle: "Stalemate",
    abandonedTitle: "Player Disconnected",
    timeoutTitle: "Time Out",
    forfeitTitle: "Forfeit",
    finishedTitle: "Game Over",
    reviewHint: "Use Spectate To Replay Match"
  },
  modals: {
    forfeitTitle: "Forfeit Game?",
    forfeitBody: "This will immediately end the game and give your opponent the win."
  },
  notices: {
    connected: "Connected.",
    disconnected: "Disconnected from Server.",
    opponentPiece: "That is your opponent's piece.",
    spectatorNoMove: "Spectators cannot move pieces.",
    notYourTurn: "It is not your turn.",
    aiThinking: "AI is thinking...",
    gameUpdated: "Game Updated.",
    isoLoading: "Loading Isometric Board...",
    isoFailed: "3D view failed to load.",
    usePlaneView: "Use XY, XZ, or YZ view while this is fixed.",
    noChatYet: "No Messages Yet.",
    chatFailed: "Message could not be sent.",
    roomCopied: "Room Code Copied."
  }
};
