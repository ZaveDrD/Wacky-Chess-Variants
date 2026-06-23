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
  { id: "classical", label: "Classical", seconds: 30 * 60 },
  { id: "rapid", label: "Rapid", seconds: 10 * 60 },
  { id: "blitz", label: "Blitz", seconds: 5 * 60 },
  { id: "bullet", label: "Bullet", seconds: 60 }
];

export function getVariantLabel(id) {
  return VARIANT_OPTIONS.find((variant) => variant.id === id)?.label || VARIANT_OPTIONS[0].label;
}

export function getTimeControlLabel(id) {
  return TIME_CONTROL_OPTIONS.find((control) => control.id === id)?.label || TIME_CONTROL_OPTIONS[1].label;
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
