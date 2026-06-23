export const VARIANT_OPTIONS = [
  { id: "normal", label: "Normal Chess" },
  { id: "threeD", label: "3D Chess" },
  { id: "chess960", label: "Chess960" },
  { id: "crazyhouse", label: "Crazyhouse" },
  { id: "kingOfTheHill", label: "King of the Hill" },
  { id: "atomic", label: "Atomic Chess" },
  { id: "nuke", label: "Nuke" },
  { id: "tycoon", label: "Tycoon" },
  { id: "predict", label: "Predict" },
  { id: "scooby", label: "Scooby" },
  { id: "threeCheck", label: "3-Check" },
  { id: "antichess", label: "Anti-Chess" },
  { id: "anarchy", label: "Anarchy Chess" },
  { id: "ruleLab", label: "Rule Lab" }
];

export const TIME_CONTROL_OPTIONS = [
  { id: "unlimited", label: "Unlimited", seconds: null, incrementSeconds: 0, category: "Casual", aliases: ["none", "infinite", "no-clock", "untimed"] },
  { id: "bullet", label: "Bullet 1+0", seconds: 60, incrementSeconds: 0, category: "Bullet", aliases: ["1+0"] },
  { id: "bullet1_1", label: "Bullet 1+1", seconds: 60, incrementSeconds: 1, category: "Bullet", aliases: ["1+1"] },
  { id: "bullet2_1", label: "Bullet 2+1", seconds: 2 * 60, incrementSeconds: 1, category: "Bullet", aliases: ["2+1"] },
  { id: "blitz3", label: "Blitz 3+0", seconds: 3 * 60, incrementSeconds: 0, category: "Blitz", aliases: ["3+0"] },
  { id: "blitz3_2", label: "Blitz 3+2", seconds: 3 * 60, incrementSeconds: 2, category: "Blitz", aliases: ["3+2"] },
  { id: "blitz", label: "Blitz 5+0", seconds: 5 * 60, incrementSeconds: 0, category: "Blitz", aliases: ["5+0"] },
  { id: "blitz5_3", label: "Blitz 5+3", seconds: 5 * 60, incrementSeconds: 3, category: "Blitz", aliases: ["5+3"] },
  { id: "rapid", label: "Rapid 10+0", seconds: 10 * 60, incrementSeconds: 0, category: "Rapid", aliases: ["10+0"] },
  { id: "rapid10_5", label: "Rapid 10+5", seconds: 10 * 60, incrementSeconds: 5, category: "Rapid", aliases: ["10+5"] },
  { id: "rapid15_10", label: "Rapid 15+10", seconds: 15 * 60, incrementSeconds: 10, category: "Rapid", aliases: ["15+10"] },
  { id: "rapid30", label: "Rapid 30+0", seconds: 30 * 60, incrementSeconds: 0, category: "Rapid", aliases: ["30+0"] },
  { id: "classical", label: "Classical 30+20", seconds: 30 * 60, incrementSeconds: 20, category: "Classical", aliases: ["30+20"] },
  { id: "classical45_45", label: "Classical 45+45", seconds: 45 * 60, incrementSeconds: 45, category: "Classical", aliases: ["45+45"] },
  { id: "classical60", label: "Classical 60+0", seconds: 60 * 60, incrementSeconds: 0, category: "Classical", aliases: ["60+0"] },
  { id: "classical90_30", label: "Classical 90+30", seconds: 90 * 60, incrementSeconds: 30, category: "Classical", aliases: ["90+30"] }
];

export function getTimeControlOption(id) {
  return TIME_CONTROL_OPTIONS.find((control) => control.id === id) || TIME_CONTROL_OPTIONS.find((control) => control.id === "rapid") || TIME_CONTROL_OPTIONS[0];
}

export function describeTimeControl(id) {
  const control = getTimeControlOption(id);
  if (!control || control.seconds == null) return "No clock";
  const baseMinutes = Math.floor(control.seconds / 60);
  return `${baseMinutes}+${control.incrementSeconds || 0}`;
}

export function getTimeControlReferenceLines() {
  return TIME_CONTROL_OPTIONS.map((control) => {
    const aliases = (control.aliases || []).length ? ` aliases: ${(control.aliases || []).join(", ")}` : "";
    const clock = control.seconds == null ? "unlimited" : `${Math.floor(control.seconds / 60)}+${control.incrementSeconds || 0}`;
    return `${control.id.padEnd(18)} ${control.label.padEnd(18)} ${clock}${aliases}`;
  });
}

export function getVariantReferenceLines() {
  const aliases = {
    normal: "2d, standard, normalchess",
    threeD: "3d, threed, three, 3dchess",
    chess960: "960, fischerrandom",
    crazyhouse: "crazy, house",
    kingOfTheHill: "koth, hill, kingofthehill",
    threeCheck: "3check, three-check",
    antichess: "anti",
    ruleLab: "rulelab, rule",
    atomic: "atomicchess",
    nuke: "nukechess",
    tycoon: "tycoonchess",
    predict: "predictchess",
    scooby: "scoobychess",
    anarchy: "anarchychess"
  };
  return VARIANT_OPTIONS.map((variant) => `${variant.id.padEnd(16)} ${variant.label.padEnd(20)} aliases: ${aliases[variant.id] || "—"}`);
}

export function getVariantLabel(id) {
  return VARIANT_OPTIONS.find((variant) => variant.id === id)?.label || VARIANT_OPTIONS[0].label;
}

export function getTimeControlLabel(id) {
  return getTimeControlOption(id)?.label || TIME_CONTROL_OPTIONS[1].label;
}

export const GAME_MODE_OPTIONS = [
  { id: "online", label: "Online Multiplayer" },
  { id: "ai", label: "Vs AI" }
];

export const RULE_LAB_DIFFICULTY_OPTIONS = [
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
  { id: "chaos", label: "Chaos" }
];

export const AI_DIFFICULTY_OPTIONS = [
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" }
];

export function getGameModeLabel(id) {
  return GAME_MODE_OPTIONS.find((mode) => mode.id === id)?.label || GAME_MODE_OPTIONS[0].label;
}

export function getAIDifficultyLabel(id) {
  return AI_DIFFICULTY_OPTIONS.find((difficulty) => difficulty.id === id)?.label || AI_DIFFICULTY_OPTIONS[1].label;
}

export function getRuleLabDifficultyLabel(id) {
  return RULE_LAB_DIFFICULTY_OPTIONS.find((difficulty) => difficulty.id === id)?.label || RULE_LAB_DIFFICULTY_OPTIONS[1].label;
}
