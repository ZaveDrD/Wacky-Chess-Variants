export const VARIANT_OPTIONS = [
  { id: "threeD", label: "3D Chess" },
  { id: "normal", label: "Normal Chess" }
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
