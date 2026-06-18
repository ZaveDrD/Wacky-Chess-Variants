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
  }
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
