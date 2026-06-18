// Developer console command registry.
// Edit `name` / `aliases` here to change what you type in the hidden console.
// `summary` is documentation-only and is intentionally not rendered in-game.
export const DEV_CONSOLE_UNLOCK_SEQUENCE = ["Shift", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Shift"];

export const DEV_COMMANDS = [
  {
    action: "help",
    name: "help",
    aliases: ["commands", "?"],
    usage: "help",
    summary: "Shows developer console command usages in the console output. Does not send a server request."
  },
  {
    action: "clear",
    name: "clear",
    aliases: ["cls"],
    usage: "clear",
    summary: "Clears the developer console output. Does not affect the match."
  },
  {
    action: "findOpenMatches",
    name: "findopenmatches",
    aliases: ["rooms", "listrooms", "openmatches"],
    usage: "findopenmatches",
    summary: "Queries the server for active room codes and compact match information."
  },
  {
    action: "spectateMatch",
    name: "spectatematch",
    aliases: ["spectate", "watch"],
    usage: "spectatematch [room code | random]",
    summary: "Joins an existing room as a spectator. Use random to spectate a random active room."
  },
  {
    action: "joinCode",
    name: "joincode",
    aliases: ["join", "joinroom"],
    usage: "joincode [room code]",
    summary: "Joins a room using normal join behaviour. If the player seats are full, you become a spectator."
  },
  {
    action: "startMatch",
    name: "startmatch",
    aliases: ["newmatch", "spawnmatch"],
    usage: "startmatch [variant_name] [num_bots] [bot_difficulty=medium]",
    summary: "Creates a new match. num_bots can be 0, 1, or 2. With 2 bots, the developer joins as spectator."
  },
  {
    action: "exitMatch",
    name: "exitmatch",
    aliases: ["exit", "leave", "home"],
    usage: "exitmatch",
    summary: "Exits the current match and returns the client to the lobby. If you are an active player, the match is abandoned."
  },
  {
    action: "roomInfo",
    name: "roominfo",
    aliases: ["inspectroom", "matchinfo"],
    usage: "roominfo [room code]",
    summary: "Shows compact server-side metadata for a room. Defaults to the current room if no code is provided."
  },
  {
    action: "copyRoom",
    name: "copyroom",
    aliases: ["copycode", "copy"],
    usage: "copyroom",
    summary: "Copies the current room code to the clipboard. Client-side only."
  },
  {
    action: "setView",
    name: "setview",
    aliases: ["view"],
    usage: "setview [xz | xy | yz | iso]",
    summary: "Changes the local board view. Client-side only and only useful in 3D Chess."
  },
  {
    action: "setLayer",
    name: "setlayer",
    aliases: ["layer"],
    usage: "setlayer [0-7]",
    summary: "Changes the local layer in plane views. Client-side only and only useful in 3D Chess."
  },
  {
    action: "addPiece",
    name: "addpiece",
    aliases: ["spawnpiece", "placepiece"],
    usage: "addpiece [x,y,z | e4 | x y z] [piecetype] [colour=turn]",
    summary: "Adds a piece to the current room. Supports piece types pawn, knight, bishop, rook, queen, king. Normal Chess requires y=0."
  },
  {
    action: "removePiece",
    name: "removepiece",
    aliases: ["deletepiece", "delpiece"],
    usage: "removepiece [x,y,z | e4 | x y z]",
    summary: "Removes the piece at a board location in the current room."
  },

  {
    action: "replaceWithBot",
    name: "replacewithbot",
    aliases: ["botreplace", "swapwithbot"],
    usage: "replacewithbot [name] [difficulty=medium]",
    summary: "Replaces an active player with an AI bot. The replaced human becomes a spectator. If the target is already a bot, this updates that bot slot/difficulty."
  },
  {
    action: "replacePlayer",
    name: "replaceplayer",
    aliases: ["takeover", "swapin"],
    usage: "replaceplayer [name]",
    summary: "You take over the named active player's colour. The replaced human becomes a spectator; replacing a bot removes that bot from the colour slot."
  },
  {
    action: "endMatch",
    name: "endmatch",
    aliases: ["finishmatch", "endgame"],
    usage: "endmatch [white | black | none]",
    summary: "Ends the current match. With no parameter or none/draw/nowinner, the match ends without a winner."
  },
  {
    action: "findPlayer",
    name: "findplayer",
    aliases: ["finduser", "whereis"],
    usage: "findplayer [name]",
    summary: "Searches all active rooms for a player or spectator name."
  },
  {
    action: "playerCount",
    name: "playercount",
    aliases: ["countplayers", "servercount"],
    usage: "playercount",
    summary: "Shows active room, human player, spectator, bot, and unique human counts."
  },
  {
    action: "spectatorOverride",
    name: "spectatoroverride",
    aliases: ["override", "moveall", "godmode"],
    usage: "spectatoroverride [player=self]",
    summary: "Allows a named participant, or yourself by default, to select and move any piece in the current room regardless of spectator status, colour, or turn."
  },
  {
    action: "clearOverride",
    name: "clearoverride",
    aliases: ["disableoverride", "ungodmode"],
    usage: "clearoverride [player=self]",
    summary: "Disables spectatoroverride for a named participant, or yourself by default."
  },
  {
    action: "setTimer",
    name: "settimer",
    aliases: ["clock", "setclock"],
    usage: "settimer [seconds | mm:ss | hh:mm:ss] [white|black=turn]",
    summary: "Sets a player clock in the current match. If no colour is supplied, it applies to the current turn."
  },
  {
    action: "setPlayerColour",
    name: "setplayercolour",
    aliases: ["setplayercolor", "setcolour", "setcolor"],
    usage: "setplayercolour [name] [white|black|spectator]",
    summary: "Moves a player/spectator into white, black, or spectator. Quote names with spaces. Existing colour holders are swapped or moved to spectator as needed."
  },
  {
    action: "listPieces",
    name: "listpieces",
    aliases: ["pieces"],
    usage: "listpieces [white|black]",
    summary: "Lists current pieces and locations in the active room. Optional colour filter."
  },
  {
    action: "setTurn",
    name: "setturn",
    aliases: ["turn"],
    usage: "setturn [white|black]",
    summary: "Sets whose turn it is in the current room and restarts that side's active clock reference time."
  }
,

  {
    action: "teleportPiece",
    name: "teleportpiece",
    aliases: ["teleport", "tp"],
    usage: "teleportpiece [from] [to]",
    summary: "Moves a piece directly without recording a normal move. Captures anything at the destination."
  },
  {
    action: "moveForce",
    name: "moveforce",
    aliases: ["forcemove"],
    usage: "moveforce [from] [to]",
    summary: "Moves a piece without legality validation and records it in move history."
  },
  {
    action: "legalMovesAt",
    name: "legalmoves",
    aliases: ["movesfrom"],
    usage: "legalmoves [location]",
    summary: "Lists legal moves for the piece at a location."
  },
  {
    action: "checkStatus",
    name: "checkstatus",
    aliases: ["statuscheck"],
    usage: "checkstatus",
    summary: "Shows check, legal move, and game status information."
  },
  {
    action: "validateBoard",
    name: "validateboard",
    aliases: ["boardcheck"],
    usage: "validateboard",
    summary: "Reports invalid board state such as missing kings, overlaps, duplicate IDs, or out-of-bounds pieces."
  },
  {
    action: "resetMatch",
    name: "resetmatch",
    aliases: ["resetgame"],
    usage: "resetmatch",
    summary: "Resets the current match to the starting position while keeping room membership."
  },
  {
    action: "clonePosition",
    name: "cloneposition",
    aliases: ["saveposition"],
    usage: "cloneposition",
    summary: "Prints a compact encoded position string that can be loaded later."
  },
  {
    action: "loadPosition",
    name: "loadposition",
    aliases: ["loadpos"],
    usage: "loadposition [code]",
    summary: "Loads a position string created by cloneposition."
  },
  {
    action: "aiThink",
    name: "aithink",
    aliases: ["think"],
    usage: "aithink [white|black] [difficulty]",
    summary: "Shows the top AI move candidates without moving."
  },
  {
    action: "forceAIMove",
    name: "forceaimove",
    aliases: ["aimove"],
    usage: "forceaimove [white|black] [difficulty]",
    summary: "Forces the selected side to make an AI move immediately."
  },
  {
    action: "setAIDifficulty",
    name: "setaidifficulty",
    aliases: ["botdifficulty"],
    usage: "setaidifficulty [white|black] [easy|medium|hard]",
    summary: "Changes or creates the AI controller for a side."
  },
  {
    action: "pauseBots",
    name: "pausebots",
    aliases: ["stopbots"],
    usage: "pausebots",
    summary: "Pauses AI turns in the current room."
  },
  {
    action: "resumeBots",
    name: "resumebots",
    aliases: ["startbots"],
    usage: "resumebots",
    summary: "Resumes AI turns in the current room."
  },
  {
    action: "botBattle",
    name: "botbattle",
    aliases: ["bots"],
    usage: "botbattle [variant] [difficulty1] [difficulty2]",
    summary: "Starts a bot-vs-bot match. Client maps this to startmatch with two bots."
  },
  {
    action: "evalPosition",
    name: "evalposition",
    aliases: ["eval"],
    usage: "evalposition [white|black]",
    summary: "Prints the AI static evaluation for a side."
  },
  {
    action: "topMoves",
    name: "topmoves",
    aliases: ["bestmoves"],
    usage: "topmoves [white|black] [n=5]",
    summary: "Lists the top AI candidate moves and approximate scores."
  },
  {
    action: "kickPlayer",
    name: "kickplayer",
    aliases: ["kick"],
    usage: "kickplayer [name]",
    summary: "Removes a player/spectator from the current room."
  },
  {
    action: "lockRoom",
    name: "lockroom",
    aliases: ["lock"],
    usage: "lockroom",
    summary: "Prevents extra spectators from joining the current room."
  },
  {
    action: "unlockRoom",
    name: "unlockroom",
    aliases: ["unlock"],
    usage: "unlockroom",
    summary: "Allows spectators to join the current room again."
  },
  {
    action: "renameRoom",
    name: "renameroom",
    aliases: ["roomname"],
    usage: "renameroom [name]",
    summary: "Sets a display name on the current room."
  },
  {
    action: "broadcast",
    name: "broadcast",
    aliases: ["say"],
    usage: "broadcast [message]",
    summary: "Adds a system message to the current room chat."
  },
  {
    action: "systemChat",
    name: "systemchat",
    aliases: ["syschat"],
    usage: "systemchat [message]",
    summary: "Adds a system chat line to the current room."
  },
  {
    action: "listRoomsDetailed",
    name: "listrooms",
    aliases: ["roomsdetailed", "roomsd"],
    usage: "listrooms detailed",
    summary: "Shows all active rooms with detailed server metadata."
  },
  {
    action: "pauseTimer",
    name: "pausetimer",
    aliases: ["freezetimer"],
    usage: "pausetimer",
    summary: "Pauses both clocks in the current room."
  },
  {
    action: "resumeTimer",
    name: "resumetimer",
    aliases: ["unfreezetimer"],
    usage: "resumetimer",
    summary: "Resumes clocks in the current room."
  },
  {
    action: "addTime",
    name: "addtime",
    aliases: ["incrementtime"],
    usage: "addtime [white|black] [time]",
    summary: "Adds time to a player's clock."
  },
  {
    action: "setTimeControl",
    name: "settimecontrol",
    aliases: ["changetimecontrol"],
    usage: "settimecontrol [classical|rapid|blitz|bullet]",
    summary: "Changes the time control and resets both clocks."
  },
  {
    action: "flagPlayer",
    name: "flag",
    aliases: ["timeout"],
    usage: "flag [white|black]",
    summary: "Forces a player to lose on time."
  },
  {
    action: "showCoords",
    name: "showcoords",
    aliases: ["coords"],
    usage: "showcoords",
    summary: "Toggles coordinate labels on the board. Client-side visual command."
  },
  {
    action: "showAttacks",
    name: "showattacks",
    aliases: ["attacks"],
    usage: "showattacks [white|black]",
    summary: "Highlights attacked squares. Client-side visual command using current board movement."
  },
  {
    action: "showChecks",
    name: "showchecks",
    aliases: ["checks"],
    usage: "showchecks",
    summary: "Highlights kings and checking pieces."
  },
  {
    action: "highlightSquare",
    name: "highlight",
    aliases: ["mark"],
    usage: "highlight [location]",
    summary: "Temporarily highlights a square."
  },
  {
    action: "clearHighlights",
    name: "clearhighlights",
    aliases: ["clearhl"],
    usage: "clearhighlights",
    summary: "Clears local developer highlights."
  },
  {
    action: "ghostMove",
    name: "ghostmove",
    aliases: ["previewmove"],
    usage: "ghostmove [from] [to]",
    summary: "Shows a projected move marker without moving the piece."
  },
  {
    action: "chaosMove",
    name: "chaosmove",
    aliases: ["randommove"],
    usage: "chaosmove",
    summary: "Makes a random legal move for the current player."
  },
  {
    action: "swapKings",
    name: "swapkings",
    aliases: ["kingswap"],
    usage: "swapkings",
    summary: "Swaps the kings' positions."
  },
  {
    action: "promoteAll",
    name: "promoteall",
    aliases: ["promoteallpawns"],
    usage: "promoteall [white|black] [piece]",
    summary: "Promotes all pawns for a side into the selected piece type."
  },
  {
    action: "army",
    name: "army",
    aliases: ["setarmy"],
    usage: "army [white|black] [piece]",
    summary: "Replaces all non-king pieces of a side with one piece type."
  },
  {
    action: "mirrorBoard",
    name: "mirrorboard",
    aliases: ["mirror"],
    usage: "mirrorboard",
    summary: "Mirrors all pieces across the board."
  },
  {
    action: "shuffleBackRank",
    name: "shufflebackrank",
    aliases: ["chess960"],
    usage: "shufflebackrank",
    summary: "Randomises back-rank non-king pieces."
  },
  {
    action: "spawnArmy",
    name: "spawnarmy",
    aliases: ["spawnpieces"],
    usage: "spawnarmy [white|black] [piece] [count]",
    summary: "Adds random pieces for a side."
  },
  {
    action: "nuke",
    name: "nuke",
    aliases: ["blast"],
    usage: "nuke [location] [radius]",
    summary: "Removes non-king pieces around a location."
  },
  {
    action: "kingOfTheHill",
    name: "kingofthehill",
    aliases: ["hill"],
    usage: "kingofthehill",
    summary: "Moves kings to central test positions."
  },
];

export function findDevCommand(inputName) {
  const normalised = normaliseCommandName(inputName);
  return DEV_COMMANDS.find((command) => {
    const names = [command.name, ...(command.aliases || [])].map(normaliseCommandName);
    return names.includes(normalised);
  }) || null;
}

export function normaliseCommandName(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}
