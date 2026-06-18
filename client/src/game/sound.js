
let audioContext = null;
let unlocked = false;

export function unlockAudio() {
  try {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return false;
      audioContext = new AudioContextClass();
    }
    if (audioContext.state === "suspended") audioContext.resume();
    unlocked = true;
    return true;
  } catch {
    return false;
  }
}

export function playSoundEffect(type, options = {}) {
  const enabled = options.enabled !== false;
  const volume = clamp(Number(options.volume ?? 0.45), 0, 1);
  if (!enabled || volume <= 0) return;
  if (!unlocked) unlockAudio();
  if (!audioContext || audioContext.state === "suspended") return;

  const now = audioContext.currentTime;
  const master = audioContext.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume * 0.32), now + 0.012);
  master.gain.exponentialRampToValueAtTime(0.0001, now + durationFor(type));
  master.connect(audioContext.destination);

  if (type === "capture") {
    tone(180, 0.08, "square", master, now);
    tone(90, 0.13, "sine", master, now + 0.035);
    return;
  }

  if (type === "check") {
    tone(520, 0.09, "triangle", master, now);
    tone(720, 0.12, "triangle", master, now + 0.08);
    return;
  }

  if (type === "checkmate" || type === "gameOver") {
    tone(392, 0.13, "triangle", master, now);
    tone(494, 0.13, "triangle", master, now + 0.12);
    tone(587, 0.24, "triangle", master, now + 0.25);
    return;
  }

  if (type === "illegal") {
    tone(140, 0.08, "sawtooth", master, now);
    tone(110, 0.11, "sawtooth", master, now + 0.06);
    return;
  }

  if (type === "chat") {
    tone(740, 0.055, "sine", master, now);
    tone(980, 0.07, "sine", master, now + 0.055);
    return;
  }

  if (type === "matchFound" || type === "start") {
    tone(440, 0.08, "triangle", master, now);
    tone(660, 0.1, "triangle", master, now + 0.08);
    tone(880, 0.12, "triangle", master, now + 0.16);
    return;
  }

  if (type === "timer") {
    tone(900, 0.04, "square", master, now);
    return;
  }

  if (type === "shout") {
    tone(220, 0.08, "sawtooth", master, now);
    tone(440, 0.14, "triangle", master, now + 0.08);
    return;
  }

  tone(360, 0.055, "triangle", master, now);
  tone(260, 0.07, "sine", master, now + 0.045);
}

function tone(frequency, duration, type, destination, startTime) {
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.55, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.02);
}

function durationFor(type) {
  if (type === "checkmate" || type === "gameOver") return 0.62;
  if (type === "matchFound" || type === "start") return 0.38;
  if (type === "shout") return 0.32;
  if (type === "check") return 0.26;
  if (type === "capture") return 0.22;
  return 0.16;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
