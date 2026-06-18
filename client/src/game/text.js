export const UI_TEXT = {
  siteTitle: "The Gallery Of Wacky Chess Variants",
  appTitle: "3D Chess",
  appSubtitle: "Pick a variant, choose a time control, and start a room.",
  lobby: {
    variantLabel: "Variant",
    timeControlLabel: "Time Control",
    nameLabel: "Player Name",
    namePlaceholder: "Enter Name",
    hostButton: "Host Game",
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
        "Checkmate opponent to win."
      ]
    },
    normal: {
      label: "Normal Chess",
      subtitle: "Standard chess on one 8×8 board.",
      rules: [
        "Pieces use standard chess movement.",
        "Checkmate opponent to win."
      ]
    }
  },
  timeControls: {
    classical: "Classical",
    rapid: "Rapid",
    blitz: "Blitz",
    bullet: "Bullet"
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
    gameUpdated: "Game updated.",
    isoLoading: "Loading Isometric Board...",
    isoFailed: "3D view failed to load.",
    usePlaneView: "Use XY, XZ, or YZ view while this is fixed.",
    noChatYet: "No Messages Yet.",
    chatFailed: "Message could not be sent.",
    roomCopied: "Room code copied."
  }
};
