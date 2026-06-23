// Developer console command registry.
// The visible console is intentionally organised as broad command groups.
// Old one-word commands remain as aliases so existing habits still work.
export const DEV_CONSOLE_UNLOCK_SEQUENCE = ["Shift", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Shift"];

export const DEV_COMMANDS = [
  { name: "help", action: "help", usage: "help [page|category|command]", summary: "Shows paged command help." },
  { name: "clear", action: "clear", aliases: ["cls"], usage: "clear", summary: "Clears the developer console output." },
  { name: "room", action: "room", usage: "room [list|join|start|spectate|kick|lock|unlock|rename|exit|info] ...", summary: "Room and matchmaking commands." },
  { name: "player", action: "player", usage: "player [bot|takeover|find|count|override|colour|rename] ...", summary: "Player slot and identity commands." },
  { name: "account", action: "account", aliases: ["accounts"], usage: "account [info|list|online|create|remove|icon|wipe|store] ...", summary: "Inspect and manage registered player accounts." },
  { name: "report", action: "report", aliases: ["reports"], usage: "report [list|view|approve|deny|appeal] ...", summary: "Review and resolve report cases." },
  { name: "punish", action: "punish", aliases: ["punishment", "punishments"], usage: "punish [list|mute|ban|remove] ...", summary: "Create and remove mutes/bans." },
  { name: "friend", action: "friend", aliases: ["friends"], usage: "friend [list|send|accept] ...", summary: "Friend-system test commands." },
  { name: "leaderboard", action: "leaderboard", aliases: ["leaderboards", "lb"], usage: "leaderboard [show|reset] [variant] [month|allTime|both]", summary: "Inspect and reset leaderboard standings." },
  { name: "profile", action: "profile", usage: "profile [username|email|id]", summary: "View a public player profile." },
  { name: "match", action: "match", usage: "match [end|turn|reset|validate|forfeit]", summary: "Match state commands." },
  { name: "chat", action: "chat", usage: "chat [shout|announce|system|sudo|whisper|quote] ...", summary: "Chat, announcements, and fake-message commands." },
  { name: "board", action: "board", usage: "board [clear|copy|load|mirror|shuffle] ...", summary: "Whole-board editing commands." },
  { name: "piece", action: "piece", usage: "piece [add|remove|teleport|force|replace|list|find|legal|attacks|promote|god] ...", summary: "Piece inspection/editing commands." },
  { name: "view", action: "view", usage: "view [mode|layer|coords] ...", summary: "Local view controls." },
  { name: "mark", action: "mark", usage: "mark [square|clear|ghost|checks|attacks|spotlight|ping] ...", summary: "Local square markers and debug highlights." },
  { name: "ai", action: "ai", usage: "ai [think|move|difficulty|pause|resume|eval|top] ...", summary: "AI testing commands." },
  { name: "clock", action: "clock", usage: "clock [set|pause|resume|add|preset|flag] ...", summary: "Timer commands." },
  { name: "network", action: "network", aliases: ["net"], usage: "network [summary|server|rooms|room|ai|dashboard] ...", summary: "Server/network diagnostics and live graphs." },
  { name: "fx", action: "fx", usage: "fx [effect] ...", summary: "Visual-only troll effects and board chaos." },
  { name: "cosmetic", action: "cosmetic", usage: "cosmetic [piece|player|icon|curse|clear] ...", summary: "Visual-only piece/player cosmetics." },
  { name: "chaos", action: "chaos", usage: "chaos [move|swap|shuffle|yeet|clone|mutate|promote|downgrade|king|pawnstorm|civilwar|tax|blessing] ...", summary: "Dangerous state-changing chaos commands." },
  { name: "predict", action: "predict", usage: "predict [state|reveal|clear|lock|resolve|round|ghost|peek|test|fake|panic] ...", summary: "Predict variant commands." },
  { name: "scooby", action: "scooby", usage: "scooby [state|reveal|visible|trap|smoke|control|test] ...", summary: "Scooby trap/smoke/control commands." },
  { name: "tycoon", action: "tycoon", usage: "tycoon [state|money|upgrade|income|wall|bomb|shield|silo|buyout] ...", summary: "Tycoon economy/building commands." },
  { name: "nuke", action: "nuke", usage: "nuke [state|charge|launch|explode|clear|mark|timer|oops|blast] ...", summary: "Nuke variant commands." },
  { name: "crazyhouse", action: "crazyhouse", aliases: ["crazy"], usage: "crazyhouse [reserve|drop|test] ...", summary: "Crazyhouse reserve/drop commands." },
  { name: "atomic", action: "atomic", usage: "atomic [mark|explode|chainreaction|nuclearpawns|test] ...", summary: "Atomic explosion commands." },
  { name: "hill", action: "hill", aliases: ["kingofthehill"], usage: "hill [setup|state|mark|test] ...", summary: "King of the Hill commands." }
];

const GROUPS = {
  room: {
    page: 1,
    summary: "Rooms and matchmaking.",
    subcommands: [
      ["list open", "room list open", "List open rooms."],
      ["list detailed", "room list detailed", "List all rooms with metadata."],
      ["spectate", "room spectate [room|random]", "Spectate a room."],
      ["join", "room join [room]", "Join a room."],
      ["start", "room start [variant] [bots=0] [difficulty=medium]", "Start a dev match."],
      ["botbattle", "room botbattle [variant] [difficulty1] [difficulty2]", "Start bot-vs-bot match."],
      ["exit", "room exit", "Return to home/lobby."],
      ["info", "room info [room=current]", "Show room metadata."],
      ["copy", "room copy", "Copy current room code."],
      ["close", "room close [code=current] [reason]", "Close a room and send players home with a reason."],
      ["kick", "room kick [name] [reason]", "Kick a player/spectator back to home screen with optional reason."],
      ["lock", "room lock", "Prevent additional spectators."],
      ["unlock", "room unlock", "Allow spectators."],
      ["rename", "room rename [name]", "Set room display name."]
    ]
  },
  player: {
    page: 1,
    summary: "Players, seats, identities.",
    subcommands: [
      ["bot", "player bot [name] [difficulty=medium]", "Replace player with bot."],
      ["takeover", "player takeover [name]", "Take over a player slot."],
      ["find", "player find [name]", "Find player in rooms."],
      ["count", "player count", "Show player/bot/spectator counts."],
      ["override", "player override [self|name] [on|off]", "Allow moving all pieces."],
      ["colour", "player colour [name] [white|black|spectator]", "Move participant to slot."],
      ["rename", "player rename [white|black|name] [new name]", "Temporarily rename a player."]
    ]
  },
  account: {
    page: 1,
    summary: "Registered account inspection and admin controls.",
    subcommands: [
      ["info", "account info [username|email|id]", "Show account email, profile, stats, and recent games."],
      ["list", "account list [limit]", "List recently created accounts."],
      ["online", "account online [username|email|id]", "Show whether an account is online and what room/socket it is using."],
      ["create", "account create [email] [username] [password]", "Create an account from the console."],
      ["remove", "account remove [username|email|id]", "Remove an account and its sessions."],
      ["icon", "account icon [username|email|id] [icon-file]", "Set an account profile icon."],
      ["wipe", "account wipe [username|email|id] [game|all]", "Reset stats, game history, ELO history, and leaderboard entries; all also clears hidden moderation history."],
      ["store", "account store", "Show the account JSON store path and available profile icons."]
    ]
  },
  report: {
    page: 1,
    summary: "Reports and moderation cases.",
    subcommands: [
      ["list", "report list [date|strength|name]", "List open report cases."],
      ["view", "report view [caseId]", "Print case evidence, illegal moves, and chat logs."],
      ["approve", "report approve [caseId] [mute|ban] [duration|-1] [reason]", "Approve report and punish reported player."],
      ["deny", "report deny [caseId]", "Deny report and reduce reporter credibility."],
      ["appeal", "report appeal list|view|approve|deny ...", "Review punishment appeals."]
    ]
  },
  punish: {
    page: 1,
    summary: "Manual punishment tools.",
    subcommands: [
      ["list", "punish list", "List active punishments."],
      ["all", "punish all", "List all punishments."],
      ["mute", "punish mute [target] [duration|-1] [reason]", "Mute account/device."],
      ["ban", "punish ban [target] [duration|-1] [reason]", "Ban account/device from joining games."],
      ["remove", "punish remove [punishmentId]", "Remove punishment."]
    ]
  },
  friend: {
    page: 1,
    summary: "Friend test commands.",
    subcommands: [
      ["list", "friend list", "Show your social state."],
      ["send", "friend send [username]", "Send a friend request."],
      ["accept", "friend accept [requestId|username]", "Accept a friend request."]
    ]
  },
  leaderboard: {
    page: 1,
    summary: "Leaderboard commands. Resets always target only the specified mode/variant.",
    subcommands: [
      ["show", "leaderboard show [variant] [month|allTime]", "Show top 100 for a mode."],
      ["reset month", "leaderboard reset [variant] month", "Reset only the current monthly leaderboard for the specified mode."],
      ["reset allTime", "leaderboard reset [variant] allTime", "Reset only the all-time leaderboard for the specified mode."],
      ["reset both", "leaderboard reset [variant] both", "Reset monthly and all-time leaderboards for the specified mode."]
    ]
  },
  profile: {
    page: 1,
    summary: "Public profile command.",
    subcommands: [["view", "profile [username|email|id]", "Show public profile stats."]]
  },
  match: {
    page: 1,
    summary: "Match-level state.",
    subcommands: [
      ["end", "match end [white|black|none]", "End the match."],
      ["turn", "match turn [white|black]", "Force current turn."],
      ["reset", "match reset", "Reset to starting position."],
      ["validate", "match validate", "Validate board state."],
      ["forfeit", "match forfeit", "Forfeit as current player."]
    ]
  },
  chat: {
    page: 1,
    summary: "Chat, fake messages, announcements.",
    subcommands: [
      ["shout", "chat shout [message]", "Large overlay announcement. Alias: shout."],
      ["announce", "chat announce [message]", "System-style announcement. Alias: announce."],
      ["system", "chat system [message]", "System chat line."],
      ["sudo", "chat sudo [white|black|name] [message]", "Fake chat from a player. Alias: sudo."],
      ["whisper", "chat whisper [white|black|name] [message]", "Private dev message. Alias: whisper."],
      ["quote", "chat quote blunder", "Random blunder quote. Alias: blunderquote."]
    ]
  },
  board: {
    page: 2,
    summary: "Whole-board state.",
    subcommands: [
      ["clear", "board clear", "Remove all pieces."],
      ["copy", "board copy", "Print position code."],
      ["load", "board load [code]", "Load position code."],
      ["mirror", "board mirror", "Mirror all pieces."],
      ["shuffle backrank", "board shuffle backrank", "Randomise back rank."]
    ]
  },
  piece: {
    page: 2,
    summary: "Piece editing and inspection.",
    subcommands: [
      ["add", "piece add [square] [piece] [colour=turn]", "Add a piece."],
      ["remove", "piece remove [square]", "Remove piece."],
      ["teleport", "piece teleport [from] [to]", "Move without recording."],
      ["force", "piece force [from] [to]", "Move and record, ignoring legality."],
      ["replace", "piece replace [square] [piece] [colour]", "Replace occupied square."],
      ["list", "piece list [white|black]", "List pieces."],
      ["find", "piece find [id|type]", "Find pieces."],
      ["legal", "piece legal [square]", "List legal moves."],
      ["attacks", "piece attacks [square]", "List attack squares."],
      ["kill king", "piece kill king [white|black]", "Remove a king."],
      ["promote", "piece promote [square] [piece]", "Change one piece type."],
      ["moved", "piece moved [square] [true|false]", "Edit hasMoved flag."],
      ["god", "piece god [square] [on|off]", "Make a piece unkillable. Alias: god."]
    ]
  },
  view: {
    page: 2,
    summary: "Local view controls.",
    subcommands: [
      ["mode", "view mode [xz|xy|yz|iso]", "Set view plane."],
      ["layer", "view layer [0-7]", "Set 3D layer."],
      ["coords", "view coords [on|off|toggle]", "Coordinate labels."]
    ]
  },
  mark: {
    page: 2,
    summary: "Local board markers.",
    subcommands: [
      ["square", "mark square [square]", "Highlight a square."],
      ["clear", "mark clear", "Clear highlights/ghosts."],
      ["ghost", "mark ghost [from] [to|clear]", "Show projected move."],
      ["checks", "mark checks", "Highlight king squares."],
      ["attacks", "mark attacks [white|black]", "Highlight piece origins."],
      ["spotlight", "mark spotlight [square]", "Dramatic local spotlight. Alias: spotlight."],
      ["ping", "mark ping [square]", "Ping a square. Alias: ping."]
    ]
  },
  ai: {
    page: 2,
    summary: "AI tools.",
    subcommands: [
      ["think", "ai think [white|black] [difficulty]", "AI candidates."],
      ["move", "ai move [white|black] [difficulty]", "Force AI move."],
      ["difficulty", "ai difficulty [white|black] [easy|medium|hard]", "Set bot difficulty."],
      ["availability", "ai availability", "Show which AI difficulties are enabled."],
      ["enable/disable", "ai enable|disable [easy|medium|hard]", "Enable or disable a difficulty button for online players."],
      ["pause", "ai pause", "Pause bots."],
      ["resume", "ai resume", "Resume bots."],
      ["eval", "ai eval [white|black]", "Evaluate position."],
      ["top", "ai top [white|black] [n=5]", "Top moves."]
    ]
  },
  clock: {
    page: 2,
    summary: "Timer controls.",
    subcommands: [
      ["set", "clock set [white|black] [seconds|mm:ss]", "Set clock."],
      ["pause", "clock pause", "Pause clock."],
      ["resume", "clock resume", "Resume clock."],
      ["add", "clock add [white|black] [seconds|mm:ss]", "Add time."],
      ["preset", "clock preset [classical|rapid|blitz|bullet]", "Reset time control."],
      ["flag", "clock flag [white|black]", "Force timeout."]
    ]
  },
  network: {
    page: 3,
    summary: "Server/network diagnostics and live graphs.",
    subcommands: [
      ["summary", "network summary", "Overall CPU, memory, bandwidth, and AI share."],
      ["server", "network server", "Server process and host metrics."],
      ["rooms", "network rooms", "One-line metrics for every room."],
      ["room", "network room [code]", "Detailed metrics for a room without joining it."],
      ["ai", "network ai [all|code]", "AI CPU proxy and move timings."],
      ["dashboard", "network dashboard [overall|code]", "Open real-time graph dashboard."]
    ]
  },
  fx: {
    page: 3,
    summary: "Visual-only troll/feedback effects.",
    options: [
      "confetti", "flashboard", "invertboard [turns]", "drunkboard [turns]", "earthquake", "emoji [emoji]", "rain [emoji|piece]",
      "freeze [seconds]", "fakecheck", "fakewin [white|black]", "pause dramatic", "bonk [player]", "jumpscare [player|all]",
      "toasty", "laser [from] [to]", "board rainbow|disco|fog|snow|bloodmoon|night|mirror|tilt|squish|theme [theme]", "fireworks",
      "scooby zoinks|jinkies|footprints|haunt|ghosttrap|smoke|mysterymachine|clue|traproulette|boo|owners|panicpawns|magnify"
    ],
    subcommands: [
      ["effect", "fx [effect] [args]", "Run visual effect locally. See options below."],
      ["force", "fx force [target] [effect] [args]", "Force an FX command onto another client."],
      ["clear", "fx clear", "Clear active visual effects."]
    ]
  },
  cosmetic: {
    page: 3,
    summary: "Visual-only cosmetics.",
    options: ["piece [square] size big|tiny", "piece [square] spin|jiggle|glow [colour]|hat [type]|mustache|name [text]|clown|ghost", "icon [colour] [piece] [emoji]", "player [white|black] duckify|scoobydoo", "curse [player] [slippery|haunted|tiny|giant|rainbow|upsideDown]", "clear"],
    subcommands: [
      ["piece", "cosmetic piece [square] [effect] ...", "Apply piece cosmetic locally."],
      ["force", "cosmetic force [target] [piece|player|icon|curse|clear] ...", "Force a cosmetic command onto another client."],
      ["player", "cosmetic player [player] [effect]", "Apply player cosmetic locally."],
      ["icon", "cosmetic icon [colour] [piece] [emoji]", "Override piece icon locally."],
      ["curse", "cosmetic curse [player] [curse|clear]", "Apply/remove visual curse."],
      ["clear", "cosmetic clear", "Clear cosmetics."]
    ]
  },
  chaos: {
    page: 4,
    summary: "[DANGEROUS] General game-state chaos.",
    subcommands: [
      ["move", "chaos move", "Random legal move."],
      ["swap", "chaos swap kings|queens", "Swap key pieces."],
      ["shuffle", "chaos shuffle [white|black|all]", "Shuffle pieces."],
      ["yeet", "chaos yeet [square]", "Remove piece."],
      ["clone", "chaos clone [from] [to]", "Duplicate piece."],
      ["mutate", "chaos mutate [square] [piece]", "Change piece type."],
      ["promote", "chaos promote random [colour]", "Randomly upgrade one piece."],
      ["downgrade", "chaos downgrade [square]", "Turn piece into pawn."],
      ["king", "chaos king teleport [colour] [square]", "Teleport king."],
      ["pawnstorm", "chaos pawnstorm [colour]", "Advance pawns."],
      ["civilwar", "chaos civilwar [colour]", "Swap same-colour pieces."],
      ["tax", "chaos tax [colour]", "Remove random non-king."],
      ["blessing", "chaos blessing [colour]", "Shield/buff random piece."]
    ]
  },
  predict: {
    page: 4,
    summary: "Predict variant debug and fun.",
    subcommands: [
      ["state", "predict state", "Round and locked status."],
      ["reveal", "predict reveal", "Reveal pending moves to dev."],
      ["clear", "predict clear [white|black|all]", "Clear pending move(s)."],
      ["lock", "predict lock [colour] [from] [to]", "Force pending move."],
      ["resolve", "predict resolve", "Resolve pending moves."],
      ["round", "predict round [number]", "Set round counter."],
      ["ghost", "predict ghost [colour]", "Show pending move as local ghost."],
      ["peek", "predict peek [white|black]", "Dev-only peek. Alias: predictpeek."],
      ["test", "predict test capture|illegal|mate", "Create test setup."],
      ["fake", "predict fake [colour] [square]", "Fake prediction marker."],
      ["panic", "predict panic", "Suspense overlay."]
    ]
  },
  scooby: {
    page: 5,
    summary: "Scooby variant trap/smoke/control tools.",
    subcommands: [
      ["state", "scooby state", "Trap/smoke/control state."],
      ["reveal", "scooby reveal", "Reveal all traps to dev."],
      ["hide", "scooby hide", "Return to hidden mode."],
      ["visible", "scooby visible [white|black]", "What a player sees."],
      ["detected", "scooby detected [white|black]", "Pawn-detected traps."],
      ["owners", "scooby owners", "Owner summary."],
      ["trap", "scooby trap add|remove|clear|list|counts|limit|random|storm|convert|trigger|defuse|spring ...", "Trap editing/chaos."],
      ["smoke", "scooby smoke add|clear|list|expire|turns|bomb ...", "Smoke editing."],
      ["control", "scooby control add|release|list|expire|turns|zap ...", "Mind-control editing."],
      ["test", "scooby test defuse|mine|pitfall|smoke|mindcontrol ...", "Quick test setups."]
    ]
  },
  tycoon: {
    page: 5,
    summary: "Tycoon economy/building tools.",
    subcommands: [
      ["state", "tycoon state", "Money/upgrades/walls/bombs."],
      ["money", "tycoon money set|add|remove|bankrupt [colour] [amount]", "Edit money."],
      ["upgrade", "tycoon upgrade storage|production [colour] [level]", "Set upgrades."],
      ["income", "tycoon income [colour]", "Force income tick."],
      ["wall", "tycoon wall place|clear|remove ...", "Wall tools."],
      ["bomb", "tycoon bomb place|explode|clear|party ...", "Bomb tools."],
      ["shield", "tycoon shield add|remove [square]", "Shield tools."],
      ["silo", "tycoon silo list", "List silos."],
      ["buy", "tycoon buy queen [colour] [square] free", "Free piece buy."],
      ["buyout", "tycoon buyout [square] [colour]", "Convert piece ownership."]
    ]
  },
  nuke: {
    page: 6,
    summary: "Nuke variant tools.",
    subcommands: [
      ["state", "nuke state", "Charge/active nuke state."],
      ["charge", "nuke charge set|add|max [colour] [amount]", "Edit charge."],
      ["launch", "nuke launch [square] [colour] [radius]", "Force launch."],
      ["explode", "nuke explode [colour]", "Detonate active nuke."],
      ["clear", "nuke clear", "Clear active nukes."],
      ["mark", "nuke mark [square] [radius]", "Highlight blast."],
      ["timer", "nuke timer [colour] [turns]", "Edit timer."],
      ["oops", "nuke oops [square]", "Place real short-timer nuke."],
      ["blast", "nuke blast [square] [radius]", "Generic instant board nuke."]
    ]
  },
  crazyhouse: {
    page: 6,
    summary: "Crazyhouse reserve/drop tools.",
    subcommands: [
      ["reserve", "crazyhouse reserve list|add|clear|gift|bomb ...", "Reserve editing."],
      ["drop", "crazyhouse drop [colour] [piece] [square] | chaos [count]", "Drops."],
      ["test", "crazyhouse test dropcheck", "Drop-check setup."]
    ]
  },
  atomic: {
    page: 6,
    summary: "Atomic tools.",
    subcommands: [
      ["mark", "atomic mark [square]", "Show blast area."],
      ["explode", "atomic explode [square] [real]", "Trigger explosion."],
      ["chainreaction", "atomic chainreaction", "Repeated explosions."],
      ["nuclearpawns", "atomic nuclearpawns", "Toggle pawn captures explode."],
      ["test", "atomic test king|pawn", "Test setups."]
    ]
  },
  hill: {
    page: 6,
    summary: "King of the Hill tools.",
    subcommands: [
      ["setup", "hill setup", "Move kings to hill setup."],
      ["state", "hill state", "Show distances."],
      ["mark", "hill mark", "Highlight hill."],
      ["test", "hill test win [colour]", "Immediate hill win setup."]
    ]
  }
};

const LEGACY = {
  findopenmatches: ["room", "list", "open"], rooms: ["room", "list", "open"], listrooms: ["room", "list", "detailed"], openmatches: ["room", "list", "open"],
  spectatematch: ["room", "spectate"], spectate: ["room", "spectate"], watch: ["room", "spectate"],
  joincode: ["room", "join"], join: ["room", "join"], joinroom: ["room", "join"],
  startmatch: ["room", "start"], newmatch: ["room", "start"], spawnmatch: ["room", "start"], botbattle: ["room", "botbattle"],
  exitmatch: ["room", "exit"], exit: ["room", "exit"], leave: ["room", "exit"], home: ["room", "exit"],
  roominfo: ["room", "info"], copyroom: ["room", "copy"], closeroom: ["room", "close"], kickplayer: ["room", "kick"], lockroom: ["room", "lock"], unlockroom: ["room", "unlock"], renameroom: ["room", "rename"],
  replacewithbot: ["player", "bot"], replaceplayer: ["player", "takeover"], findplayer: ["player", "find"], playercount: ["player", "count"], spectatoroverride: ["player", "override", "self", "on"], clearoverride: ["player", "override", "self", "off"], setplayercolour: ["player", "colour"], rename: ["player", "rename"],
  endmatch: ["match", "end"], setturn: ["match", "turn"], resetmatch: ["match", "reset"], validateboard: ["match", "validate"],
  shout: ["chat", "shout"], announce: ["chat", "announce"], broadcast: ["chat", "system"], systemchat: ["chat", "system"], sudo: ["chat", "sudo"], whisper: ["chat", "whisper"], blunderquote: ["chat", "quote", "blunder"],
  clearboard: ["board", "clear"], cloneposition: ["board", "copy"], loadposition: ["board", "load"], mirrorboard: ["board", "mirror"], shufflebackrank: ["board", "shuffle", "backrank"],
  addpiece: ["piece", "add"], removepiece: ["piece", "remove"], teleportpiece: ["piece", "teleport"], moveforce: ["piece", "force"], replacepiece: ["piece", "replace"], listpieces: ["piece", "list"], findpiece: ["piece", "find"], legalmoves: ["piece", "legal"], attacks: ["piece", "attacks"], killking: ["piece", "kill", "king"], promote: ["piece", "promote"], setmoved: ["piece", "moved"], god: ["piece", "god"],
  setview: ["view", "mode"], setlayer: ["view", "layer"], showcoords: ["view", "coords", "toggle"],
  showattacks: ["mark", "attacks"], showchecks: ["mark", "checks"], highlight: ["mark", "square"], clearhighlights: ["mark", "clear"], ghostmove: ["mark", "ghost"], clearghost: ["mark", "ghost", "clear"], spotlight: ["mark", "spotlight"], ping: ["mark", "ping"],
  aithink: ["ai", "think"], forceaimove: ["ai", "move"], setaidifficulty: ["ai", "difficulty"], pausebots: ["ai", "pause"], resumebots: ["ai", "resume"], evalposition: ["ai", "eval"], topmoves: ["ai", "top"],
  settimer: ["clock", "set"], pausetimer: ["clock", "pause"], resumetimer: ["clock", "resume"], addtime: ["clock", "add"], settimecontrol: ["clock", "preset"], flag: ["clock", "flag"],
  confetti: ["fx", "confetti"], flashboard: ["fx", "flashboard"], invertboard: ["fx", "invertboard"], drunkboard: ["fx", "drunkboard"], earthquake: ["fx", "earthquake"], emoji: ["fx", "emoji"], rain: ["fx", "rain"], freezeui: ["fx", "freeze"], fakecheck: ["fx", "fakecheck"], fakewin: ["fx", "fakewin"], dramaticpause: ["fx", "pause", "dramatic"], bonk: ["fx", "bonk"], jumpscare: ["fx", "jumpscare"], toasty: ["fx", "toasty"], laser: ["fx", "laser"], rainbowboard: ["fx", "board", "rainbow"], disco: ["fx", "board", "disco"], fog: ["fx", "board", "fog"], snow: ["fx", "board", "snow"], fireworks: ["fx", "fireworks"], bloodmoon: ["fx", "board", "bloodmoon"], nightmode: ["fx", "board", "night"], mirrorvisual: ["fx", "board", "mirror"], tiltboard: ["fx", "board", "tilt"], squishboard: ["fx", "board", "squish"], boardtheme: ["fx", "board", "theme"], clearvisuals: ["fx", "clear"],
  bigpiece: ["cosmetic", "piece", null, "size", "big"], tinypiece: ["cosmetic", "piece", null, "size", "tiny"], spinpiece: ["cosmetic", "piece", null, "spin"], jigglepiece: ["cosmetic", "piece", null, "jiggle"], glowpiece: ["cosmetic", "piece", null, "glow"], hat: ["cosmetic", "piece", null, "hat"], mustache: ["cosmetic", "piece", null, "mustache"], renamepiece: ["cosmetic", "piece", null, "name"], swapicons: ["cosmetic", "icon"], duckify: ["cosmetic", "player", null, "duckify"], clownpiece: ["cosmetic", "piece", null, "clown"], ghostpiece: ["cosmetic", "piece", null, "ghost"], curse: ["cosmetic", "curse"], uncurse: ["cosmetic", "curse", null, "clear"], clearcosmetics: ["cosmetic", "clear"],
  chaosmove: ["chaos", "move"], swapkings: ["chaos", "swap", "kings"], swapqueens: ["chaos", "swap", "queens"], shufflepieces: ["chaos", "shuffle"], yeet: ["chaos", "yeet"], clonepiece: ["chaos", "clone"], mutatepiece: ["chaos", "mutate"], randompromote: ["chaos", "promote", "random"], downgrade: ["chaos", "downgrade"], teleportking: ["chaos", "king", "teleport"], pawnstorm: ["chaos", "pawnstorm"], civilwar: ["chaos", "civilwar"], tax: ["chaos", "tax"], blessing: ["chaos", "blessing"],
  predictstate: ["predict", "state"], predictreveal: ["predict", "reveal"], predictclear: ["predict", "clear"], predictlock: ["predict", "lock"], predictresolve: ["predict", "resolve"], predictround: ["predict", "round"], predictghost: ["predict", "ghost"], predicttestcapture: ["predict", "test", "capture"], predicttestillegal: ["predict", "test", "illegal"], predicttestmate: ["predict", "test", "mate"], predictpeek: ["predict", "peek"], fakepredict: ["predict", "fake"], misdirect: ["predict", "misdirect"], doubleblind: ["predict", "doubleblind"], spoiler: ["predict", "spoiler"], mindread: ["predict", "mindread"], predictpanic: ["predict", "panic"], confidence: ["predict", "confidence"], fakeunlock: ["predict", "fakeunlock"], predicttaunt: ["predict", "taunt"],
  scoobystate: ["scooby", "state"], scoobyreveal: ["scooby", "reveal"], scoobyhide: ["scooby", "hide"], scoobyvisible: ["scooby", "visible"], scoobydetected: ["scooby", "detected"], scoobyowners: ["scooby", "owners"], listtraps: ["scooby", "trap", "list"], trapcounts: ["scooby", "trap", "counts"], settraplimit: ["scooby", "trap", "limit"], resettraplimits: ["scooby", "trap", "limits", "reset"], addtrap: ["scooby", "trap", "add"], removetrap: ["scooby", "trap", "remove"], cleartraps: ["scooby", "trap", "clear"], triggertrap: ["scooby", "trap", "trigger"], defusetrap: ["scooby", "trap", "defuse"], randomtrap: ["scooby", "trap", "random"], trapstorm: ["scooby", "trap", "storm"], allmines: ["scooby", "trap", "convert", "mines"], allfake: ["scooby", "trap", "convert", "decoys"], springtrap: ["scooby", "trap", "spring"], addsmoke: ["scooby", "smoke", "add"], clearsmoke: ["scooby", "smoke", "clear"], listsmoke: ["scooby", "smoke", "list"], expiresmoke: ["scooby", "smoke", "expire"], smoketurns: ["scooby", "smoke", "turns"], smokebomb: ["scooby", "smoke", "bomb"], controlpiece: ["scooby", "control", "add"], releasepiece: ["scooby", "control", "release"], listcontrolled: ["scooby", "control", "list"], expirecontrol: ["scooby", "control", "expire"], controlturns: ["scooby", "control", "turns"], mindzap: ["scooby", "control", "zap"],
  tycoonstate: ["tycoon", "state"], setmoney: ["tycoon", "money", "set"], addmoney: ["tycoon", "money", "add"], givemoney: ["tycoon", "money", "add"], takemoney: ["tycoon", "money", "remove"], bankrupt: ["tycoon", "money", "bankrupt"], setstorage: ["tycoon", "upgrade", "storage"], setproduction: ["tycoon", "upgrade", "production"], forceincome: ["tycoon", "income"], placewall: ["tycoon", "wall", "place"], freewall: ["tycoon", "wall", "place", null, null, "free"], clearwalls: ["tycoon", "wall", "clear"], evict: ["tycoon", "wall", "remove"], placebomb: ["tycoon", "bomb", "place"], explodebomb: ["tycoon", "bomb", "explode"], clearbombs: ["tycoon", "bomb", "clear"], bombparty: ["tycoon", "bomb", "party"], shield: ["tycoon", "shield", "add"], unshield: ["tycoon", "shield", "remove"], listsilos: ["tycoon", "silo", "list"], freequeen: ["tycoon", "buy", "queen", null, null, "free"], hostilebuyout: ["tycoon", "buyout"],
  nukestate: ["nuke", "state"], setnukecharge: ["nuke", "charge", "set"], addnukecharge: ["nuke", "charge", "add"], maxcharge: ["nuke", "charge", "max"], launchnuke: ["nuke", "launch"], explodenuke: ["nuke", "explode"], clearnukes: ["nuke", "clear"], nukeblast: ["nuke", "mark"], nuketimer: ["nuke", "timer"], testrookblock: ["nuke", "test", "rookblock"], oopsnuke: ["nuke", "oops"],
  reserves: ["crazyhouse", "reserve", "list"], addreserve: ["crazyhouse", "reserve", "add"], clearreserve: ["crazyhouse", "reserve", "clear"], dropreserve: ["crazyhouse", "drop"], testdropcheck: ["crazyhouse", "test", "dropcheck"], pocketgift: ["crazyhouse", "reserve", "gift"], pocketbomb: ["crazyhouse", "reserve", "bomb"], dropchaos: ["crazyhouse", "drop", "chaos"],
  atomicblast: ["atomic", "mark"], explode: ["atomic", "explode"], realboom: ["atomic", "explode", null, "real"], chainreaction: ["atomic", "chainreaction"], nuclearpawns: ["atomic", "nuclearpawns"], testatomicking: ["atomic", "test", "king"], testatomicpawn: ["atomic", "test", "pawn"],
  hillstate: ["hill", "state"], showhill: ["hill", "mark"], testhillwin: ["hill", "test", "win"]
};

function normalizeName(name) {
  return String(name || "").trim().toLowerCase().replace(/^\/+/, "");
}

function expandPrefix(prefix, args) {
  const next = [];
  let argIndex = 0;
  for (const item of prefix) {
    if (item === null) next.push(args[argIndex++] ?? "");
    else next.push(item);
  }
  return [...next, ...args.slice(argIndex)];
}

export function findDevCommand(name) {
  const key = normalizeName(name);
  if (!key) return null;
  const direct = DEV_COMMANDS.find((command) => command.name === key || command.aliases?.includes(key));
  if (direct) return direct;
  const prefix = LEGACY[key];
  if (!prefix) return null;
  const action = prefix[0];
  return {
    name: key,
    action,
    prefixArgs: prefix.slice(1),
    usage: `${key} ...`,
    summary: `Alias for ${prefix.filter(Boolean).join(" ")}.`
  };
}

export function applyCommandPrefix(command, args) {
  if (!command?.prefixArgs) return args;
  return expandPrefix(command.prefixArgs, args);
}

export function getDevCommandListLines(page = null) {
  const pageNumber = Number.parseInt(page, 10);
  if (!Number.isInteger(pageNumber)) {
    return [
      "Developer console help is paged.",
      "New systems: account, report, punish, friend, leaderboard, profile.",
      "Use: help 1, help 2, help 3, ...",
      "Use: help [category] for category commands, e.g. help report",
      "Examples: help account, help report, help punish, help friend, help leaderboard, help profile",
      "Use: help [command] for aliases, e.g. help sudo",
      "Pages:",
      "1 room / player / account / report / punish / friend / leaderboard / profile / match / chat",
      "2 board / piece / view / mark / ai / clock",
      "3 network / fx / cosmetic",
      "4 chaos / predict",
      "5 scooby / tycoon",
      "6 nuke / crazyhouse / atomic / hill"
    ];
  }
  const names = Object.entries(GROUPS).filter(([, group]) => group.page === pageNumber);
  if (!names.length) return [`No help page ${pageNumber}. Available: help 1 to help 6.`];
  return [
    `Help page ${pageNumber}:`,
    ...names.map(([name, group]) => `${name.padEnd(12)} ${group.summary}`),
    "Use help [category] for subcommands.",
    pageNumber === 1 ? "Social/admin examples: account info [name] | report list strength | punish ban [target] 1h [reason] | friend send [name] | leaderboard show normal month | profile [name]" : ""
  ].filter(Boolean);
}

export function getDevCommandHelp(target = "") {
  const query = Array.isArray(target) ? target.join(" ") : String(target || "").trim();
  if (!query) return getDevCommandListLines();
  const pageNumber = Number.parseInt(query, 10);
  if (Number.isInteger(pageNumber)) return getDevCommandListLines(pageNumber);

  const tokens = query.split(/\s+/).filter(Boolean).map(normalizeName);
  const first = tokens[0];
  const command = findDevCommand(first);
  if (!command) return [`No help found for: ${query}`];

  const category = command.action;
  const args = applyCommandPrefix(command, tokens.slice(1));
  const group = GROUPS[category];

  if (!group) {
    return [
      `${command.name}`,
      `Usage: ${command.usage}`,
      command.summary || ""
    ].filter(Boolean);
  }

  if (!args.length) {
    return [
      `${category}: ${group.summary}`,
      "Subcommands:",
      ...group.subcommands.map(([name, usage, summary]) => `  ${name.padEnd(18)} ${usage} — ${summary}`),
      ...(group.options ? ["Options:", ...group.options.map((item) => `  ${item}`)] : [])
    ];
  }

  const lookup = args.join(" ");
  const sub = group.subcommands.find(([name]) => lookup === name || lookup.startsWith(`${name} `) || name.split(" ")[0] === args[0]);
  if (sub) {
    return [
      `${category} ${sub[0]}`,
      `Usage: ${sub[1]}`,
      sub[2],
      ...(group.options ? ["Available options:", ...group.options.map((item) => `  ${item}`)] : [])
    ];
  }

  return [
    `${category}: ${group.summary}`,
    `No exact subcommand help for "${args.join(" ")}".`,
    `Try: help ${category}`
  ];
}

export function getDevCommandByAction(action) {
  return DEV_COMMANDS.find((command) => command.action === action) || null;
}
