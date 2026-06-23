export const UI_TEXT = {
  siteTitle: "The Chess Lab",
  appTitle: "The Chess Lab",
  appSubtitle: "Experimental chess variants, playable instantly.",
  lobby: {
    variantLabel: "Experiment",
    timeControlLabel: "Time Control",
    ruleLabDifficultyLabel: "Rule Lab Difficulty",
    gameModeLabel: "Game Mode",
    privateModeLabel: "Host / Join Private",
    aiDifficultyLabel: "AI Difficulty",
    nameLabel: "Player Name",
    namePlaceholder: "Enter Name",
    hostButton: "Host Game",
    hostAIButton: "Start Vs AI",
    findMatchButton: "Find Match",
    cancelSearchButton: "Cancel Search",
    hostPrivateButton: "Host Private",
    joinButton: "Join",
    roomPlaceholder: "Lab Code",
    guestAccessEyebrow: "Guest access",
    playAsGuestTitle: "Play as guest",
    guestHelp: "Pick any display name and start testing, or sign into an account to save stats.",
    displayNameLabel: "Display name",
    displayNamePlaceholder: "Name yourself anything"
  },
  settings: {
    title: "Settings",
    sound: "Sound",
    volume: "Volume",
    localCensor: "Local censor",
    on: "On",
    off: "Off",
    censorHelp: "Filters names and chat on your screen only. Other players keep their own setting."
  },
  support: {
    buttonLabel: "Support",
    title: "Become A Supporter",
    intro: "Supporter contributions help keep the servers running and make it easier to keep adding new variants, polish, and multiplayer features.",
    benefitsTitle: "Supporter benefits",
    benefits: [
      "Supporter role on your account",
      "Customizable text colour",
      "Supporter badge for your profile",
      "Your name in the supporter list"
    ],
    checkoutButton: "Continue to Stripe",
    checkoutUnavailable: "Stripe checkout link not configured yet.",
    close: "Close"
  },
  account: {
    signedOutTitle: "Player Account",
    signedOutBody: "Create an account to reserve your name and start saving game stats.",
    signedInAs: "Signed in as",
    emailLabel: "Email",
    usernameLabel: "Username",
    passwordLabel: "Password",
    loginLabel: "Username or Email",
    createAccount: "Create Account",
    logIn: "Log In",
    logOut: "Log Out",
    showLogin: "Log In",
    showRegister: "Create Account",
    playAsGuest: "Continue as guest",
    accountSlot: "Account slot",
    accountReady: "Account ready",
    guestBadge: "Guest",
    accountBadge: "Account",
    statsSaved: "Stats saved to account",
    modalTitle: "Account Profile",
    manageAccount: "Manage Account",
    manageAccountHelp: "Open your profile, stats, and account settings.",
    openAccount: "Open Account",
    profileSectionTitle: "Profile",
    emailSectionTitle: "Email",
    passwordSectionTitle: "Password",
    profileIconLabel: "Profile Icon",
    equippedBadgeLabel: "Equipped badge",
    noBadgeOption: "No badge",
    noBadges: "No badges",
    currentPasswordLabel: "Current Password",
    newPasswordLabel: "New Password",
    saveProfile: "Save Profile",
    saveEmail: "Save Email",
    savePassword: "Save Password",
    memberSince: "Member since",
    gamesLabel: "Games",
    winsLabel: "Wins",
    lossesLabel: "Losses",
    drawsLabel: "Draws",
    selectedModeStats: "Selected Mode Stats",
    sessionExpired: "Account session expired. You are playing as guest.",
    created: "Account created.",
    loggedIn: "Logged in.",
    loggedOut: "Logged out.",
    updated: "Account updated.",
    authFailed: "Account action failed."
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
      subtitle: "Play with a shuffled back rank.",
      rules: [
        "Back rank is randomised.",
        "Checkmate your opponent to win."
      ]
    },
    crazyhouse: {
      label: "Crazyhouse",
      subtitle: "Drop captured pieces back onto the board.",
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
        "If your king reaches the centre squares, you win.",
        "Checkmate still wins normally."
      ]
    },
    atomic: {
      label: "Atomic Chess",
      subtitle: "Captures explode nearby non-pawn pieces.",
      rules: [
        "Any capture creates an explosion, blowing up non-pawn pieces.",
        "Destroy or checkmate the enemy king to win."
      ]
    },
    nuke: {
      label: "Nuke",
      subtitle: "Charge a nuke by capturing pieces.",
      rules: [
        "Captures charge your nuke up to radius 3.",
        "Nukes can only be launched within 2 squares of one of your pieces.",
        "Launching a nuke uses your turn and detonates after 3 turns.",
        "Rooks block the blast along ranks and files.",
        "If a nuke destroys both kings, the launcher loses.",
        "Checkmate or blow up the opponent's king to win."
      ]
    },
    tycoon: {
      label: "Tycoon",
      subtitle: "Earn money from silos to buy upgrades.",
      rules: [
        "Pieces in silo squares generate money each turn.",
        "Higher piece rank = more money generated.",
        "Place bought pieces within one square of your king.",
        "Walls block movement.",
        "Bombs destroy walls and pieces.",
        "Storage increases your max money.",
        "Production increases your money gain.",
        "Checkmate or blow up your opponent to win."
      ]
    },
    predict: {
      label: "Predict",
      subtitle: "Play with only a guess of your opponent's next move.",
      rules: [
        "Both players secretly submit one legal move each round.",
        "When both are locked in, the moves resolve.",
        "Checkmate the opponent to win."
      ]
    },
    scooby: {
      label: "Scooby",
      subtitle: "Hidden traps, smoke, and mind games layered onto normal chess.",
      rules: [
        "Each turn you may move a piece, place a trap, or try to defuse a trap.",
        "Traps only go on empty squares and never on the back two ranks.",
        "Pawns detect traps in a 4-square cross around them.",
        "Mines, pitfalls, smoke, decoys, and mind-control traps are all friendly-fire enabled.",
        "Defusing succeeds only if a trap is on the chosen square; otherwise your turn is spent."
      ]
    },
    threeCheck: {
      label: "3-Check",
      subtitle: "Win by checkmate or by giving three checks.",
      rules: [
        "Normal chess rules apply.",
        "Each check you give increases your check counter.",
        "The first player to give 3 checks wins immediately.",
        "Checkmate still wins normally."
      ]
    },
    antichess: {
      label: "Anti-Chess",
      subtitle: "Lose all your pieces to win.",
      rules: [
        "The goal is to lose all your pieces.",
        "Captures are mandatory when available.",
        "Kings are not royal: no check or checkmate.",
        "You win if you have no pieces or no legal moves."
      ]
    },
    anarchy: {
      label: "Anarchy Chess",
      subtitle: "Forced en passant, Il Vaticano, Knooks, fire, zombies, and riots.",
      rules: [
        "En passant is forced; declining it causes a brick penalty.",
        "Bishops can perform Il Vaticano to swap and capture two trapped pieces.",
        "Pawns can promote to Knooks, which move like knights or short rooks.",
        "Vertical castling is legal when a king and rook share a clear file.",
        "Special moves can trigger zombies, fire, new responses, and riots."
      ]
    },
    ruleLab: {
      label: "Rule Lab",
      subtitle: "Cooperate to discover hidden rule mutations before time runs out.",
      rules: [
        "Both players work together against a shared 15-minute timer.",
        "Hidden rules mutate the board and create anomaly logs.",
        "Use clues and submit rule guesses to discover every hidden rule.",
        "Solve all rules to win together; time expiry means both players lose."
      ]
    }
  },
  timeControls: {
    unlimited: "Unlimited",
    bullet: "Bullet 1+0",
    bullet1_1: "Bullet 1+1",
    bullet2_1: "Bullet 2+1",
    blitz3: "Blitz 3+0",
    blitz3_2: "Blitz 3+2",
    blitz: "Blitz 5+0",
    blitz5_3: "Blitz 5+3",
    rapid: "Rapid 10+0",
    rapid10_5: "Rapid 10+5",
    rapid15_10: "Rapid 15+10",
    rapid30: "Rapid 30+0",
    classical: "Classical 30+20",
    classical45_45: "Classical 45+45",
    classical60: "Classical 60+0",
    classical90_30: "Classical 90+30"
  },
  ruleLabDifficulty: {
    easy: "Easy",
    medium: "Medium",
    hard: "Hard",
    chaos: "Chaos"
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
    sendChat: "Send",
    rematch: "Rematch",
    rematchRequested: "Rematch Requested",
    viewProfile: "View Profile",
    addFriend: "Add Friend",
    challenge: "Challenge",
    message: "Message"
  },
  labels: {
    room: "Lab Room",
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
  social: {
    friendsTitle: "Friends",
    friendRequests: "Friend Requests",
    addFriendPlaceholder: "Find player by name",
    sendRequest: "Send Request",
    noFriends: "No friends yet.",
    noRequests: "No friend requests.",
    online: "Online",
    offline: "Offline",
    inGame: "In game",
    messagePlaceholder: "Message your friend...",
    challengeReceived: "Challenge received",
    accept: "Accept",
    deny: "Deny"
  },
  reports: {
    punishmentTitle: "Account Notice",
    appealPlaceholder: "Explain why this punishment should be removed...",
    submitAppeal: "Submit Appeal",
    appealSubmitted: "Appeal submitted.",
    reportRecorded: "Report recorded."
  },
  leaderboard: {
    title: "Leaderboards",
    monthly: "Monthly",
    allTime: "All Time",
    elo: "ELO",
    rank: "Rank",
    games: "Games",
    top100: "Top 100"
  },
  profile: {
    title: "Player Profile",
    overallStats: "Overall Stats",
    modeStats: "Mode Stats",
    eloHistory: "ELO History",
    gameHistory: "Game History",
    worldRank: "World Rank"
  },
  versus: {
    finding: "Finding match...",
    matched: "Match Found",
    white: "White",
    black: "Black",
    rank: "Rank",
    elo: "ELO"
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
    roomCopied: "Lab Code Copied."
  }
};
