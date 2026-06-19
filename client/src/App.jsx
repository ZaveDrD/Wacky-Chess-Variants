import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { socket } from "./socket.js";
import Board2D from "./components/Board2D.jsx";
const Board3D = lazy(() => import("./components/Board3D.jsx"));
import { PIECE_SYMBOLS } from "./game/config.js";
import { UI_TEXT } from "./game/text.js";
import {
  VARIANT_OPTIONS,
  TIME_CONTROL_OPTIONS,
  GAME_MODE_OPTIONS,
  AI_DIFFICULTY_OPTIONS,
  getVariantLabel,
  getTimeControlLabel,
  getGameModeLabel,
  getAIDifficultyLabel
} from "./game/variants.js";
import { buildReviewTimeline } from "./game/replay.js";
import { DEV_COMMANDS, DEV_CONSOLE_UNLOCK_SEQUENCE, findDevCommand, getDevCommandHelp, getDevCommandListLines } from "./game/devCommands.js";
import { playSoundEffect, unlockAudio } from "./game/sound.js";

const VIEWS = ["XZ", "XY", "YZ", "ISO"];
const REVIEW_PLAY_DELAY_MS = 650;

export default function App() {
  const [name, setName] = useState(localStorage.getItem("playerName") || "");
  const [roomInput, setRoomInput] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [color, setColor] = useState(null);
  const [role, setRole] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(localStorage.getItem("selectedVariant") || "threeD");
  const [selectedTimeControl, setSelectedTimeControl] = useState(localStorage.getItem("selectedTimeControl") || "rapid");
  const [selectedGameMode, setSelectedGameMode] = useState(localStorage.getItem("selectedGameMode") || "online");
  const [selectedAIDifficulty, setSelectedAIDifficulty] = useState(localStorage.getItem("selectedAIDifficulty") || "medium");
  const [matchmakingScope, setMatchmakingScope] = useState(localStorage.getItem("matchmakingScope") || "selected");
  const [matchmakingSearching, setMatchmakingSearching] = useState(false);
  const [game, setGame] = useState(null);
  const [view, setView] = useState("XZ");
  const [layer, setLayer] = useState(0);
  const [selectedPieceId, setSelectedPieceId] = useState(null);
  const [selectedDropType, setSelectedDropType] = useState(null);
  const [selectedTycoonAction, setSelectedTycoonAction] = useState(null);
  const [selectedScoobyAction, setSelectedScoobyAction] = useState(null);
  const [nukeTargeting, setNukeTargeting] = useState(false);
  const [legalMoves, setLegalMoves] = useState([]);
  const [notice, setNotice] = useState("");
  const [isoGizmoAxes, setIsoGizmoAxes] = useState(null);
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewPlaying, setReviewPlaying] = useState(false);
  const [dismissedGameOver, setDismissedGameOver] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [showForfeitConfirm, setShowForfeitConfirm] = useState(false);
  const [clockTick, setClockTick] = useState(Date.now());
  const [devConsoleOpen, setDevConsoleOpen] = useState(false);
  const [devConsoleInput, setDevConsoleInput] = useState("");
  const [devConsoleLines, setDevConsoleLines] = useState(["> developer console locked."]);
  const [devConsoleUnlocked, setDevConsoleUnlocked] = useState(false);
  const [devCommandHistory, setDevCommandHistory] = useState([]);
  const [devHistoryIndex, setDevHistoryIndex] = useState(-1);
  const [devVisuals, setDevVisuals] = useState({ showCoords: false, highlights: [], ghostMove: null });
  const [showVariantGuide, setShowVariantGuide] = useState(false);
  const [guideStep, setGuideStep] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(localStorage.getItem("soundEnabled") !== "false");
  const [soundVolume, setSoundVolume] = useState(Number(localStorage.getItem("soundVolume") || "0.45"));
  const [shoutOverlay, setShoutOverlay] = useState(null);
  const devSequenceIndexRef = useRef(0);
  const previousGameRef = useRef(null);
  const previousChatLengthRef = useRef(0);
  const previousClockWarningRef = useRef(null);

  useEffect(() => {
    socket.on("connect", () => setNotice(UI_TEXT.notices.connected));
    socket.on("disconnect", () => setNotice(UI_TEXT.notices.disconnected));

    socket.on("roomCreated", ({ roomCode: newRoomCode, color: playerColor, role: playerRole, game: newGame }) => {
      setRoomCode(newRoomCode);
      setColor(playerColor);
      setRole(playerRole || "player");
      setGame(newGame);
      setView(newGame.variant === "normal" ? "XZ" : "XZ");
      setLayer(0);
      setReviewMode(false);
      setReviewPlaying(false);
      setReviewIndex(0);
      setDismissedGameOver(false);
      setShowForfeitConfirm(false);
      setMatchmakingSearching(false);
      setNotice(`Room created: ${newRoomCode}`);
      if (newGame.variant !== "normal") { setShowVariantGuide(true); setGuideStep(0); }
    });

    socket.on("roomJoined", ({ roomCode: newRoomCode, color: playerColor, role: playerRole, game: newGame }) => {
      setRoomCode(newRoomCode);
      setColor(playerColor);
      setRole(playerRole || (playerColor === "spectator" ? "spectator" : "player"));
      setGame(newGame);
      setView(newGame.variant === "normal" ? "XZ" : "XZ");
      setLayer(0);
      setReviewMode(false);
      setReviewPlaying(false);
      setReviewIndex(0);
      setDismissedGameOver(false);
      setShowForfeitConfirm(false);
      setMatchmakingSearching(false);
      setNotice(playerColor === "spectator" ? `Spectating room: ${newRoomCode}` : `Joined room: ${newRoomCode}`);
      if (newGame.variant !== "normal") { setShowVariantGuide(true); setGuideStep(0); }
    });

    socket.on("gameState", (newGame) => {
      setGame((previousGame) => {
        if (shouldClearLocalSelection(previousGame, newGame)) {
          setSelectedPieceId(null);
          setLegalMoves([]);
        }
        return newGame;
      });
      if (newGame.variant === "normal") {
        setView("XZ");
        setLayer(0);
      }
      setDismissedGameOver(false);
      if (newGame.status === "finished" || newGame.status === "abandoned" || newGame.check) {
        setNotice(newGame.message || UI_TEXT.notices.gameUpdated);
      } else if (!isTurnOnlyMessage(newGame.message)) {
        setNotice(newGame.message || "");
      } else {
        setNotice("");
      }
    });

    socket.on("joinError", (message) => setNotice(message));
    socket.on("matchmakingError", (message) => { setMatchmakingSearching(false); setNotice(message); playSoundEffect("illegal", { enabled: soundEnabled, volume: soundVolume }); });
    socket.on("matchmakingStatus", (status = {}) => {
      setMatchmakingSearching(Boolean(status.searching));
      if (status.searching) {
        setNotice(status.scope === "any" ? "Searching any public match..." : "Searching selected match...");
      } else if (status.matched) {
        playSoundEffect("matchFound", { enabled: soundEnabled, volume: soundVolume });
        setNotice(`Matched in room ${status.roomCode}.`);
      } else if (status.cancelled) {
        setNotice("Quick match search cancelled.");
      }
    });
    socket.on("invalidMove", (message) => { setNotice(message); playSoundEffect("illegal", { enabled: soundEnabled, volume: soundVolume }); });
    socket.on("chatError", (message) => { setNotice(message || UI_TEXT.notices.chatFailed); playSoundEffect("illegal", { enabled: soundEnabled, volume: soundVolume }); });
    socket.on("devCommandResult", (result = {}) => {
      if (result.unlocked) setDevConsoleUnlocked(true);
      const lines = result.lines || [result.ok ? "OK" : "Command failed."];
      if (lines.length) appendDevLines(lines.map((line) => result.ok === false ? `! ${line}` : String(line)));
    });

    socket.on("shoutMessage", ({ message, from } = {}) => {
      const body = String(message || "").trim();
      if (!body) return;
      setShoutOverlay({ message: body, from: from || "Developer", id: Date.now() });
      playSoundEffect("shout", { enabled: soundEnabled, volume: soundVolume });
      window.setTimeout(() => setShoutOverlay((current) => current?.message === body ? null : current), 4200);
    });

    socket.on("legalMoves", ({ pieceId, legalMoves: moves, reason }) => {
      if (reason) {
        setNotice(reason);
        playSoundEffect("illegal", { enabled: soundEnabled, volume: soundVolume });
      }
      setSelectedPieceId(pieceId);
      setLegalMoves(moves || []);
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("roomCreated");
      socket.off("roomJoined");
      socket.off("gameState");
      socket.off("joinError");
      socket.off("matchmakingError");
      socket.off("matchmakingStatus");
      socket.off("invalidMove");
      socket.off("chatError");
      socket.off("devCommandResult");
      socket.off("shoutMessage");
      socket.off("legalMoves");
    };
  }, [soundEnabled, soundVolume]);

  useEffect(() => {
    const id = window.setInterval(() => setClockTick(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    function handleGlobalKeyDown(event) {
      if (devConsoleOpen) {
        if (event.key === "Escape") {
          event.preventDefault();
          setDevConsoleOpen(false);
        }
        return;
      }

      const sequence = DEV_CONSOLE_UNLOCK_SEQUENCE;
      const expected = sequence[devSequenceIndexRef.current];
      if (event.key === expected) {
        const nextIndex = devSequenceIndexRef.current + 1;
        if (nextIndex >= sequence.length) {
          devSequenceIndexRef.current = 0;
          setDevConsoleOpen(true);
          event.preventDefault();
        } else {
          devSequenceIndexRef.current = nextIndex;
        }
        return;
      }

      devSequenceIndexRef.current = event.key === sequence[0] ? 1 : 0;
    }

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [devConsoleOpen]);

  const is3DVariant = (game?.variant || selectedVariant) === "threeD";
  const currentVariantText = UI_TEXT.variants[game?.variant || selectedVariant] || UI_TEXT.variants.threeD;
  const reviewTimeline = useMemo(() => buildReviewTimeline(game), [game]);
  const maxReviewIndex = Math.max(0, reviewTimeline.length - 1);
  const clampedReviewIndex = Math.min(reviewIndex, maxReviewIndex);
  const displayGame = reviewMode ? reviewTimeline[clampedReviewIndex] || game : game;
  const gameIsOver = game?.status === "finished" || game?.status === "abandoned";
  const showGameOverModal = Boolean(gameIsOver && !reviewMode && !dismissedGameOver);
  const activeView = is3DVariant ? view : "XZ";
  const activeLayer = is3DVariant ? layer : 0;
  const hasDevMoveOverride = Boolean(game?.devOverrides?.moveAllPieceSocketIds?.includes(socket.id));
  const variantHighlights = useMemo(() => buildVariantHighlights(displayGame), [displayGame]);
  const canUseVariantAction = !reviewMode && !gameIsOver && role !== "spectator" && color !== "spectator" && game?.turn === color;

  function playUiSound(type) {
    playSoundEffect(type, { enabled: soundEnabled, volume: soundVolume });
  }

  useEffect(() => {
    localStorage.setItem("soundEnabled", String(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    const clamped = Math.min(1, Math.max(0, Number(soundVolume) || 0));
    localStorage.setItem("soundVolume", String(clamped));
  }, [soundVolume]);

  useEffect(() => {
    if (!game) {
      previousGameRef.current = null;
      previousChatLengthRef.current = 0;
      previousClockWarningRef.current = null;
      return;
    }

    const previousGame = previousGameRef.current;
    if (previousGame && previousGame.roomCode === game.roomCode) {
      const previousMoveCount = previousGame.moveHistory?.length || 0;
      const nextMoveCount = game.moveHistory?.length || 0;
      if (nextMoveCount > previousMoveCount) {
        const lastMove = game.moveHistory?.[nextMoveCount - 1];
        playUiSound(lastMove?.captured ? "capture" : "move");
      }

      if (!previousGame.check && game.check) playUiSound("check");
      if (previousGame.status !== game.status && (game.status === "finished" || game.status === "abandoned")) {
        playUiSound(game.checkmate ? "checkmate" : "gameOver");
      }

      const previousChatLength = previousChatLengthRef.current;
      const nextChatLength = game.chat?.length || 0;
      if (nextChatLength > previousChatLength) playUiSound("chat");

      if (game.status === "playing" && game.clocks?.[game.turn] != null) {
        const remaining = getDisplayedClocks(game, Date.now())[game.turn];
        const warningKey = `${game.roomCode}:${game.turn}:${Math.floor(remaining / 10000)}`;
        if (remaining > 0 && remaining <= 10000 && warningKey !== previousClockWarningRef.current) {
          previousClockWarningRef.current = warningKey;
          playUiSound("timer");
        }
      }
    } else {
      playUiSound("start");
    }

    previousGameRef.current = game;
    previousChatLengthRef.current = game.chat?.length || 0;
  }, [game, soundEnabled, soundVolume]);

  useEffect(() => {
    if (!game || !socket.id) return;
    const membership = getClientMembership(game, socket.id);
    if (!membership) return;
    setColor((current) => current === membership.color ? current : membership.color);
    setRole((current) => current === membership.role ? current : membership.role);
  }, [game]);

  useEffect(() => {
    if (!reviewMode) return;
    setSelectedPieceId(null);
    setSelectedDropType(null);
    setSelectedTycoonAction(null);
    setSelectedScoobyAction(null);
    setNukeTargeting(false);
    setLegalMoves([]);
    setReviewIndex((current) => Math.min(current, maxReviewIndex));
  }, [reviewMode, maxReviewIndex]);

  useEffect(() => {
    if (!reviewMode || !reviewPlaying) return undefined;

    const id = window.setInterval(() => {
      setReviewIndex((current) => {
        if (current >= maxReviewIndex) {
          setReviewPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, REVIEW_PLAY_DELAY_MS);

    return () => window.clearInterval(id);
  }, [reviewMode, reviewPlaying, maxReviewIndex]);

  const selectedPiece = useMemo(
    () => displayGame?.pieces.find((piece) => piece.id === selectedPieceId) || null,
    [displayGame, selectedPieceId]
  );

  function appendDevLines(lines) {
    const nextLines = Array.isArray(lines) ? lines : [String(lines ?? "")];
    setDevConsoleLines((current) => [...current, ...nextLines].slice(-200));
  }

  function runDevCommand(event) {
    event.preventDefault();
    const raw = devConsoleInput.trim();
    if (!raw) return;
    setDevConsoleInput("");
    setDevCommandHistory((current) => [raw, ...current.filter((item) => item !== raw)].slice(0, 60));
    setDevHistoryIndex(-1);

    if (!devConsoleUnlocked) {
      socket.emit("devCommand", { action: "devUnlock", password: raw });
      return;
    }

    appendDevLines(`> ${raw}`);

    const [rawCommandName, ...args] = parseCommandLine(raw);
    const commandName = String(rawCommandName || "").replace(/^\/+/, "");
    const command = findDevCommand(commandName);
    if (!command) {
      appendDevLines(`! unknown command: ${commandName || "<empty>"}`);
      return;
    }

    if (command.action === "help") {
      if (args.length) {
        const target = findDevCommand(args.join(" ")) || findDevCommand(args[0]);
        appendDevLines(getDevCommandHelp(target));
      } else {
        appendDevLines(["available commands:", ...getDevCommandListLines(), "type help [command_name] for details."]);
      }
      return;
    }

    if (command.action === "clear") {
      setDevConsoleLines([]);
      return;
    }

    if (command.action === "botBattle") {
      const variant = args[0] || selectedVariant;
      const difficulty = args[1] || selectedAIDifficulty || "medium";
      socket.emit("devCommand", {
        action: "startMatch",
        args: [variant, "2", difficulty],
        name: name.trim() || "Developer",
        currentRoomCode: roomCode,
        selectedVariant,
        selectedTimeControl,
        selectedAIDifficulty: difficulty
      });
      return;
    }

    if (command.action === "copyRoom") {
      copyRoomCode();
      appendDevLines(roomCode ? `copied ${roomCode}` : "! no active room code");
      return;
    }

    if (command.action === "setView") {
      const nextView = String(args[0] || "").trim().toUpperCase();
      if (!["XZ", "XY", "YZ", "ISO"].includes(nextView)) {
        appendDevLines("! usage: setview [xz | xy | yz | iso]");
        return;
      }
      setView(nextView);
      appendDevLines(`view=${nextView}`);
      return;
    }

    if (command.action === "setLayer") {
      const nextLayer = Number.parseInt(args[0], 10);
      if (!Number.isInteger(nextLayer) || nextLayer < 0 || nextLayer > 7) {
        appendDevLines("! usage: setlayer [0-7]");
        return;
      }
      setLayer(nextLayer);
      appendDevLines(`layer=${nextLayer}`);
      return;
    }

    if (command.action === "showCoords") {
      setDevVisuals((current) => ({ ...current, showCoords: !current.showCoords }));
      appendDevLines("coordinate labels toggled.");
      return;
    }

    if (command.action === "clearHighlights") {
      setDevVisuals((current) => ({ ...current, highlights: [], ghostMove: null }));
      appendDevLines("dev highlights cleared.");
      return;
    }

    if (command.action === "highlightSquare") {
      const loc = parseDevLocation(args, 0)?.location;
      if (!loc) { appendDevLines("! usage: highlight [location]"); return; }
      setDevVisuals((current) => ({ ...current, highlights: [...current.highlights, loc].slice(-64) }));
      appendDevLines(`highlighted (${loc.x},${loc.y},${loc.z}).`);
      return;
    }

    if (command.action === "ghostMove") {
      const from = parseDevLocation(args, 0);
      const to = from ? parseDevLocation(args, from.nextIndex) : null;
      if (!from || !to) { appendDevLines("! usage: ghostmove [from] [to]"); return; }
      setDevVisuals((current) => ({ ...current, ghostMove: { from: from.location, to: to.location } }));
      appendDevLines(`ghost move ${coordText(from.location)} → ${coordText(to.location)}.`);
      return;
    }

    if (command.action === "showChecks") {
      const kings = (game?.pieces || []).filter((piece) => piece.type === "king").map(({x,y,z}) => ({x,y,z}));
      setDevVisuals((current) => ({ ...current, highlights: kings }));
      appendDevLines(`highlighted ${kings.length} king square(s).`);
      return;
    }

    if (command.action === "showAttacks") {
      // Visual aid: asks the server for legal moves of every piece indirectly is expensive;
      // locally mark occupied pieces for the requested colour as a quick attack/debug layer.
      const side = String(args[0] || game?.turn || "").toLowerCase();
      const highlights = (game?.pieces || []).filter((piece) => !side || piece.color === side).map(({x,y,z}) => ({x,y,z}));
      setDevVisuals((current) => ({ ...current, highlights }));
      appendDevLines(`debug-highlighted ${highlights.length} ${side || "all"} piece origin square(s).`);
      return;
    }

    if (command.action === "exitMatch") {
      socket.emit("devCommand", {
        action: command.action,
        args,
        name: name.trim() || "Developer",
        currentRoomCode: roomCode,
        selectedVariant,
        selectedTimeControl,
        selectedAIDifficulty
      });
      returnHome();
      return;
    }

    socket.emit("devCommand", {
      action: command.action,
      args,
      name: name.trim() || "Developer",
      currentRoomCode: roomCode,
      selectedVariant,
      selectedTimeControl,
      selectedAIDifficulty
    });
  }

  function saveName() {
    const clean = name.trim() || "Player";
    localStorage.setItem("playerName", clean);
    localStorage.setItem("selectedVariant", selectedVariant);
    localStorage.setItem("selectedTimeControl", selectedTimeControl);
    localStorage.setItem("selectedGameMode", selectedGameMode);
    localStorage.setItem("selectedAIDifficulty", selectedAIDifficulty);
    localStorage.setItem("matchmakingScope", matchmakingScope);
    return clean;
  }

  function createRoom(override = {}) {
    unlockAudio();
    socket.emit("createRoom", {
      name: saveName(),
      variant: override.variant || selectedVariant,
      timeControl: override.timeControl || selectedTimeControl,
      gameMode: override.gameMode || selectedGameMode,
      aiDifficulty: override.aiDifficulty || selectedAIDifficulty
    });
  }

  function joinRoom() {
    unlockAudio();
    socket.emit("joinRoom", { roomCode: roomInput.trim().toUpperCase(), name: saveName() });
  }

  function quickMatch() {
    unlockAudio();
    const cleanName = saveName();
    setMatchmakingSearching(true);
    setNotice(matchmakingScope === "any" ? "Searching any public match..." : "Searching selected match...");
    socket.emit("quickMatch", {
      name: cleanName,
      variant: selectedVariant,
      timeControl: selectedTimeControl,
      scope: matchmakingScope
    });
  }

  function cancelQuickMatch() {
    socket.emit("cancelQuickMatch");
    setMatchmakingSearching(false);
    setNotice("Cancelling quick match search...");
  }

  function returnHome() {
    setGame(null);
    setRoomCode("");
    setColor(null);
    setRole(null);
    setSelectedPieceId(null);
    setSelectedDropType(null);
    setSelectedTycoonAction(null);
    setSelectedScoobyAction(null);
    setNukeTargeting(false);
    setLegalMoves([]);
    setNotice("");
    setReviewMode(false);
    setReviewPlaying(false);
    setReviewIndex(0);
    setDismissedGameOver(false);
    setShowForfeitConfirm(false);
    setMatchmakingSearching(false);
  }

  function startNewRoom() {
    const nextVariant = game?.variant || selectedVariant;
    const nextTimeControl = game?.timeControl || selectedTimeControl;
    const nextGameMode = game?.gameMode || selectedGameMode;
    const nextAIDifficulty = game?.ai?.difficulty || selectedAIDifficulty;
    setReviewMode(false);
    setReviewPlaying(false);
    setReviewIndex(0);
    setDismissedGameOver(false);
    setShowForfeitConfirm(false);
    createRoom({ variant: nextVariant, timeControl: nextTimeControl, gameMode: nextGameMode, aiDifficulty: nextAIDifficulty });
  }

  function startReview() {
    setReviewMode(true);
    setReviewPlaying(false);
    setReviewIndex(maxReviewIndex);
    setDismissedGameOver(true);
  }

  function requestForfeit() {
    if (!roomCode || reviewMode || gameIsOver || role === "spectator") return;
    setShowForfeitConfirm(true);
  }

  function confirmForfeit() {
    if (!roomCode || reviewMode || gameIsOver || role === "spectator") return;
    setShowForfeitConfirm(false);
    socket.emit("forfeitGame", { roomCode });
  }

  function sendChatMessage(event) {
    unlockAudio();
    event.preventDefault();
    const body = chatDraft.trim();
    if (!body || !roomCode || reviewMode || gameIsOver) return;
    socket.emit("sendChatMessage", { roomCode, body });
    setChatDraft("");
  }

  async function copyRoomCode() {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      setNotice(UI_TEXT.notices.roomCopied);
    } catch {
      setNotice(roomCode);
    }
  }

  function selectPiece(piece) {
    if (reviewMode) return;
    if (!game || !roomCode || !piece) return;
    if ((role === "spectator" || color === "spectator") && !hasDevMoveOverride) {
      setNotice(UI_TEXT.notices.spectatorNoMove);
      return;
    }
    if (piece.color !== color && !hasDevMoveOverride) {
      setNotice(UI_TEXT.notices.opponentPiece);
      return;
    }
    if (game.turn !== color && !hasDevMoveOverride) {
      setNotice(UI_TEXT.notices.notYourTurn);
      return;
    }
    setSelectedDropType(null);
    setSelectedTycoonAction(null);
    setSelectedScoobyAction(null);
    setNukeTargeting(false);
    socket.emit("selectPiece", { roomCode, pieceId: piece.id });
  }

  function attemptMove(to) {
    if (reviewMode || ((role === "spectator" || color === "spectator") && !hasDevMoveOverride)) return;
    if (!selectedPieceId) return;
    socket.emit("attemptMove", {
      roomCode,
      pieceId: selectedPieceId,
      to,
      promotion: "queen"
    });
  }

  function attemptDrop(to) {
    if (reviewMode || game?.variant !== "crazyhouse") return;
    if ((role === "spectator" || color === "spectator") && !hasDevMoveOverride) return;
    if (!selectedDropType) return;
    socket.emit("attemptDrop", {
      roomCode,
      pieceType: selectedDropType,
      to
    });
    setSelectedDropType(null);
  }

  function attemptNukeLaunch(to) {
    if (reviewMode || game?.variant !== "nuke" || !nukeTargeting) return;
    socket.emit("attemptNukeLaunch", { roomCode, to });
    setNukeTargeting(false);
  }

  function attemptTycoonAction(to = null, actionOverride = null) {
    const action = actionOverride || selectedTycoonAction;
    if (reviewMode || game?.variant !== "tycoon" || !action) return;
    socket.emit("attemptTycoonAction", { roomCode, action, to });
    setSelectedTycoonAction(null);
  }

  function attemptScoobyAction(to = null, actionOverride = null) {
    const action = actionOverride || selectedScoobyAction;
    if (reviewMode || game?.variant !== "scooby" || !action) return;
    socket.emit("attemptScoobyAction", { roomCode, action, to });
    setSelectedScoobyAction(null);
  }

  function selectScoobyAction(action) {
    setSelectedPieceId(null);
    setLegalMoves([]);
    setSelectedDropType(null);
    setSelectedTycoonAction(null);
    setNukeTargeting(false);
    setSelectedScoobyAction((current) => current === action ? null : action);
  }

  function selectTycoonAction(action) {
    setSelectedPieceId(null);
    setLegalMoves([]);
    setSelectedDropType(null);
    setNukeTargeting(false);
    setSelectedTycoonAction((current) => current === action ? null : action);
  }

  function handleSquareClick(coord) {
    unlockAudio();
    if (reviewMode || !game) return;
    if ((role === "spectator" || color === "spectator") && !hasDevMoveOverride) {
      setNotice(UI_TEXT.notices.spectatorNoMove);
      return;
    }
    const piece = game.pieces.find((candidate) => sameCoord(candidate, coord));

    if (nukeTargeting && !piece) {
      attemptNukeLaunch(coord);
      return;
    }

    if (selectedTycoonAction) {
      attemptTycoonAction(coord);
      return;
    }

    if (selectedScoobyAction) {
      attemptScoobyAction(coord);
      return;
    }

    if (selectedDropType && !piece) {
      attemptDrop(coord);
      return;
    }

    if (piece && ((piece.color === color && game.turn === color) || hasDevMoveOverride)) {
      selectPiece(piece);
      return;
    }

    if (selectedPieceId) {
      attemptMove(coord);
    }
  }

  const legalMoveKeys = useMemo(() => {
    const map = new Map();
    if (reviewMode) return map;
    for (const move of legalMoves) map.set(key(move), move);
    return map;
  }, [legalMoves, reviewMode]);

  if (!game) {
    return (
      <main className="app lobby gallery-lobby">
        <div className="lobby-chess-bg" aria-hidden="true" />
        <section className="gallery-title-wrap compact-gallery-title">
          <h1 className="gallery-title">{UI_TEXT.siteTitle}</h1>
        </section>
        <section className="lobby-card gallery-card compact-lobby-card">
          <div className="lobby-grid">
            <label>
              {UI_TEXT.lobby.variantLabel}
              <select value={selectedVariant} onChange={(event) => setSelectedVariant(event.target.value)}>
                {VARIANT_OPTIONS.map((variant) => (
                  <option key={variant.id} value={variant.id}>{variant.label}</option>
                ))}
              </select>
            </label>

            <label>
              {UI_TEXT.lobby.nameLabel}
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder={UI_TEXT.lobby.namePlaceholder} />
            </label>
          </div>

          <p className="subtle variant-subtitle compact-subtitle">{UI_TEXT.variants[selectedVariant]?.subtitle}</p>

          <div className="lobby-grid">
            <div className="selection-block compact-selection">
              <span className="selection-label">{UI_TEXT.lobby.gameModeLabel}</span>
              <div className="time-control-group mode-control-group compact-toggle-group" aria-label={UI_TEXT.lobby.gameModeLabel}>
                {GAME_MODE_OPTIONS.map((mode) => (
                  <button
                    key={mode.id}
                    className={selectedGameMode === mode.id ? "active" : ""}
                    type="button"
                    onClick={() => setSelectedGameMode(mode.id)}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            {selectedGameMode === "ai" ? (
              <div className="selection-block compact-selection">
                <span className="selection-label">{UI_TEXT.lobby.aiDifficultyLabel}</span>
                <div className="time-control-group ai-difficulty-group compact-toggle-group" aria-label={UI_TEXT.lobby.aiDifficultyLabel}>
                  {AI_DIFFICULTY_OPTIONS.map((difficulty) => (
                    <button
                      key={difficulty.id}
                      className={selectedAIDifficulty === difficulty.id ? "active" : ""}
                      type="button"
                      onClick={() => setSelectedAIDifficulty(difficulty.id)}
                    >
                      {difficulty.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="selection-block compact-selection matchmaking-scope-block">
                <span className="selection-label">Queue Scope</span>
                <label className="queue-scope-select">
                  <select value={matchmakingScope} onChange={(event) => setMatchmakingScope(event.target.value)}>
                    <option value="selected">Selected variant + time</option>
                    <option value="any">Any public match</option>
                  </select>
                </label>
              </div>
            )}
          </div>

          <div className="selection-block compact-selection">
            <span className="selection-label">{UI_TEXT.lobby.timeControlLabel}</span>
            <div className="time-control-group compact-toggle-group" aria-label={UI_TEXT.lobby.timeControlLabel}>
              {TIME_CONTROL_OPTIONS.map((control) => (
                <button
                  key={control.id}
                  className={selectedTimeControl === control.id ? "active" : ""}
                  type="button"
                  onClick={() => setSelectedTimeControl(control.id)}
                >
                  {control.label}
                </button>
              ))}
            </div>
          </div>

          {selectedGameMode === "ai" ? (
            <button className="primary main-action-button" onClick={() => createRoom()}>{UI_TEXT.lobby.hostAIButton}</button>
          ) : (
            <div className="online-action-grid">
              <button
                className="primary main-action-button"
                onClick={matchmakingSearching ? cancelQuickMatch : quickMatch}
              >
                {matchmakingSearching ? UI_TEXT.lobby.cancelSearchButton : UI_TEXT.lobby.findMatchButton}
              </button>
              <button className="secondary-action-button" onClick={() => createRoom({ gameMode: "online" })}>{UI_TEXT.lobby.hostPrivateButton}</button>
            </div>
          )}

          <div className="join-row compact-join-row">
            <input
              value={roomInput}
              onChange={(event) => setRoomInput(event.target.value.toUpperCase())}
              placeholder={UI_TEXT.lobby.roomPlaceholder}
              maxLength={6}
            />
            <button onClick={joinRoom}>{UI_TEXT.lobby.joinButton}</button>
          </div>

          <div className="lobby-footer-row">
            <p className="notice">{notice}</p>
            <SoundControls
              enabled={soundEnabled}
              volume={soundVolume}
              compact
              onToggle={() => { unlockAudio(); setSoundEnabled((value) => !value); }}
              onVolume={(value) => { unlockAudio(); setSoundVolume(value); }}
            />
          </div>
        </section>
        {shoutOverlay && <ShoutOverlay message={shoutOverlay.message} from={shoutOverlay.from} />}
        <DevConsole
          open={devConsoleOpen}
          input={devConsoleInput}
          lines={devConsoleLines}
          unlocked={devConsoleUnlocked}
          history={devCommandHistory}
          historyIndex={devHistoryIndex}
          onHistoryIndexChange={setDevHistoryIndex}
          onInputChange={setDevConsoleInput}
          onSubmit={runDevCommand}
          onClose={() => setDevConsoleOpen(false)}
        />
      </main>
    );
  }

  return (
    <main className="app game-app">
      <section className="top-bar">
        <div>
          <h1>{getVariantLabel(game.variant)} {game.variant !== "normal" && <button className="variant-info-button" type="button" onClick={() => { setShowVariantGuide(true); setGuideStep(0); }} aria-label="Show variant guide">i</button>}</h1>
          <p className="subtle">
            {UI_TEXT.labels.room}{" "}
            <strong className="room-code-copy" onClick={copyRoomCode} title="Click to copy room code">{roomCode}</strong>
            {" · "}{getTimeControlLabel(game.timeControl)}
            {" · "}{getGameModeLabel(game.gameMode)}
            {game.ai?.enabled ? ` (${getAIDifficultyLabel(game.ai.difficulty)})` : ""}
            {" · "}{UI_TEXT.labels.youAre} <strong>{color === "spectator" ? UI_TEXT.labels.roleSpectator : color}</strong>
          </p>
        </div>
        <div className="status-box">
          <span className={`status-pill ${game.status}`}>{game.status}</span>
          {reviewMode ? (
            <span>{UI_TEXT.labels.review}: <strong>{clampedReviewIndex}/{maxReviewIndex}</strong></span>
          ) : (
            <span>{UI_TEXT.labels.turn}: <strong>{game.turn}</strong></span>
          )}
          {game.check && <span className="danger">{game.check} is in check</span>}
          <SoundControls
            enabled={soundEnabled}
            volume={soundVolume}
            onToggle={() => { unlockAudio(); setSoundEnabled((value) => !value); }}
            onVolume={(value) => { unlockAudio(); setSoundVolume(value); }}
          />
        </div>
      </section>

      <section className="game-shell">
        <aside className="side-panel">
          <h2>{UI_TEXT.headings.players}</h2>
          <PlayerLine label={UI_TEXT.labels.white} player={game.players.white} active={!reviewMode && game.turn === "white"} />
          <PlayerLine label={UI_TEXT.labels.black} player={game.players.black} active={!reviewMode && game.turn === "black"} />
          <div className="spectator-line">
            <span>{UI_TEXT.labels.spectators}</span>
            <strong>{game.spectators?.length || 0}</strong>
          </div>

          <h2>{UI_TEXT.headings.selected}</h2>
          {selectedPiece ? (
            <div className="selected-card">
              <span className="piece-preview">{PIECE_SYMBOLS[selectedPiece.color][selectedPiece.type]}</span>
              <div>
                <strong>{selectedPiece.color} {selectedPiece.type}</strong>
                <p>x {selectedPiece.x}, y {selectedPiece.y}, z {selectedPiece.z}</p>
              </div>
            </div>
          ) : (
            <p className="subtle">{UI_TEXT.emptyStates.noPieceSelected}</p>
          )}

          <h2>{UI_TEXT.headings.rules}</h2>
          <ul className="rules-list">
            {currentVariantText.rules.map((rule) => <li key={rule}>{rule}</li>)}
          </ul>

          {reviewMode ? (
            <MatchReviewControls
              reviewIndex={clampedReviewIndex}
              maxReviewIndex={maxReviewIndex}
              reviewPlaying={reviewPlaying}
              onSetIndex={(nextIndex) => setReviewIndex(Math.min(maxReviewIndex, Math.max(0, nextIndex)))}
              onPlayToggle={() => setReviewPlaying((playing) => !playing)}
            />
          ) : !gameIsOver ? (
            <GameChat
              chat={game.chat || []}
              draft={chatDraft}
              onDraftChange={setChatDraft}
              onSend={sendChatMessage}
              onForfeit={requestForfeit}
              canForfeit={role !== "spectator" && color !== "spectator"}
            />
          ) : null}

          {reviewMode && (
            <div className="review-left-actions">
              <button className="danger-button" onClick={returnHome}>{UI_TEXT.buttons.exitReview}</button>
              <button onClick={startNewRoom}>{UI_TEXT.buttons.newRoom}</button>
            </div>
          )}
        </aside>

        <section className="board-area">
          <TimerBar game={game} now={clockTick} />
          <div className="board-frame">
            {activeView === "ISO" && is3DVariant ? (
              <ErrorBoundary>
                <Suspense fallback={<div className="loading-box">{UI_TEXT.notices.isoLoading}</div>}>
                  <Board3D
                    game={displayGame}
                    selectedPieceId={selectedPieceId}
                    legalMoveKeys={legalMoveKeys}
                    onPieceClick={selectPiece}
                    onCameraChange={setIsoGizmoAxes}
                    devVisuals={devVisuals}
                  />
                </Suspense>
              </ErrorBoundary>
            ) : (
              <Board2D
                game={displayGame}
                plane={activeView}
                layer={activeLayer}
                selectedPieceId={selectedPieceId}
                legalMoveKeys={legalMoveKeys}
                onSquareClick={handleSquareClick}
                onLayerChange={is3DVariant ? setLayer : null}
                stacked={is3DVariant}
                title={is3DVariant ? undefined : getVariantLabel(game.variant)}
                devVisuals={devVisuals}
                variantHighlights={variantHighlights}
              />
            )}
            {is3DVariant && activeView === "ISO" && <OrientationGizmo view={activeView} layer={activeLayer} isoAxes={isoGizmoAxes} />}
          </div>
        </section>

        <aside className="side-panel move-panel">
          <div className="move-history-section">
            <h2>{UI_TEXT.headings.moveHistory}</h2>
            <ol className="move-history">
              {(displayGame.moveHistory || []).length === 0 && (
                <li className="empty-history">{UI_TEXT.emptyStates.noMovesYet}</li>
              )}
              {(displayGame.moveHistory || []).slice(-24).map((move, index) => (
                <li key={`${move.pieceId}-${move.time}-${index}`}>
                  {formatMoveEntry(move)}
                </li>
              ))}
            </ol>
          </div>

          <VariantControls
            game={game}
            color={color}
            disabled={!canUseVariantAction}
            selectedDropType={selectedDropType}
            selectedTycoonAction={selectedTycoonAction}
            selectedScoobyAction={selectedScoobyAction}
            nukeTargeting={nukeTargeting}
            onReserveSelect={(type) => {
              setSelectedPieceId(null);
              setLegalMoves([]);
              setSelectedTycoonAction(null);
              setSelectedScoobyAction(null);
              setNukeTargeting(false);
              setSelectedDropType((current) => current === type ? null : type);
            }}
            onNukeTarget={() => {
              setSelectedPieceId(null);
              setLegalMoves([]);
              setSelectedDropType(null);
              setSelectedTycoonAction(null);
              setSelectedScoobyAction(null);
              setNukeTargeting((value) => !value);
            }}
            onTycoonSelect={selectTycoonAction}
            onTycoonInstant={(action) => attemptTycoonAction(null, action)}
            onScoobySelect={selectScoobyAction}
            onScoobyInstant={(action) => attemptScoobyAction(null, action)}
          />

          {is3DVariant && (
            <div className="right-controls">
              <h2>{UI_TEXT.headings.viewControls}</h2>
              <div className="game-controls-panel">
                <div className="view-buttons view-buttons-column">
                  {VIEWS.map((candidate) => (
                    <button
                      key={candidate}
                      className={activeView === candidate ? "active" : ""}
                      onClick={() => setView(candidate)}
                    >
                      {candidate}
                    </button>
                  ))}
                </div>

                <LayerRailControl
                  view={activeView}
                  layer={activeLayer}
                  onSelect={(nextLayer) => setLayer(Math.min(7, Math.max(0, nextLayer)))}
                />
              </div>
            </div>
          )}

          {gameIsOver && !reviewMode && (
            <ReviewControls onStartReview={startReview} />
          )}

          <p className="notice right-notice">{notice}</p>
        </aside>
      </section>

      {showGameOverModal && (
        <GameOverModal
          game={game}
          onReturnHome={returnHome}
          onReplay={startNewRoom}
          onReview={startReview}
          onClose={() => setDismissedGameOver(true)}
        />
      )}

      {showForfeitConfirm && (
        <ConfirmModal
          title={UI_TEXT.modals.forfeitTitle}
          body={UI_TEXT.modals.forfeitBody}
          confirmLabel={UI_TEXT.buttons.confirmForfeit}
          cancelLabel={UI_TEXT.buttons.cancel}
          onConfirm={confirmForfeit}
          onCancel={() => setShowForfeitConfirm(false)}
        />
      )}

      {showVariantGuide && game.variant !== "normal" && (
        <VariantGuideModal
          variant={game.variant}
          step={guideStep}
          onStep={setGuideStep}
          onClose={() => setShowVariantGuide(false)}
        />
      )}

      {shoutOverlay && <ShoutOverlay message={shoutOverlay.message} from={shoutOverlay.from} />}

      <DevConsole
        open={devConsoleOpen}
        input={devConsoleInput}
        lines={devConsoleLines}
        unlocked={devConsoleUnlocked}
        history={devCommandHistory}
        historyIndex={devHistoryIndex}
        onHistoryIndexChange={setDevHistoryIndex}
        onInputChange={setDevConsoleInput}
        onSubmit={runDevCommand}
        onClose={() => setDevConsoleOpen(false)}
      />
    </main>
  );
}


function SoundControls({ enabled, volume, onToggle, onVolume, compact = false }) {
  return (
    <div className={`sound-controls ${compact ? "compact" : ""}`}>
      <button type="button" onClick={onToggle} title={enabled ? "Sound on" : "Sound off"}>
        {enabled ? "Sound On" : "Sound Off"}
      </button>
      {enabled && (
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={(event) => onVolume(Number(event.target.value))}
          aria-label="Sound volume"
        />
      )}
    </div>
  );
}

function ShoutOverlay({ message, from }) {
  return (
    <div className="shout-overlay" aria-live="assertive">
      <div className="shout-card">
        <span>{from}</span>
        <strong>{message}</strong>
      </div>
    </div>
  );
}

function DevConsole({ open, input, lines, unlocked, history, historyIndex, onHistoryIndexChange, onInputChange, onSubmit, onClose }) {
  const inputRef = useRef(null);
  const outputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open || !outputRef.current) return;
    outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [open, lines]);

  if (!open) return null;

  return (
    <div className="dev-console" role="dialog" aria-label="Developer command console">
      <div className="dev-console-output" ref={outputRef}>
        {lines.length === 0 ? <div className="dev-console-line muted">type help</div> : lines.map((line, index) => {
          const text = String(line);
          const tone = text.startsWith("!") ? "error" : text.startsWith(">") ? "command" : "result";
          return <div key={`${text}-${index}`} className={`dev-console-line ${tone}`}>{text}</div>;
        })}
      </div>
      <form className="dev-console-input-row" onSubmit={onSubmit}>
        <span>/</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp") {
              event.preventDefault();
              const next = Math.min((history?.length || 0) - 1, historyIndex + 1);
              if (next >= 0) { onHistoryIndexChange(next); onInputChange(history[next] || ""); }
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              const next = Math.max(-1, historyIndex - 1);
              onHistoryIndexChange(next);
              onInputChange(next === -1 ? "" : history[next] || "");
            }
          }}
          placeholder={unlocked ? "developer command" : "password"}
          type={unlocked ? "text" : "password"}
          spellCheck="false"
        />
        <button type="button" onClick={onClose} aria-label="Close developer console">Esc</button>
      </form>
    </div>
  );
}


function VariantControls({ game, color, disabled, selectedDropType, selectedTycoonAction, nukeTargeting, onReserveSelect, onNukeTarget, onTycoonSelect, onTycoonInstant }) {
  if (!game || !["crazyhouse", "nuke", "tycoon"].includes(game.variant)) return null;
  return (
    <section className="variant-side-panel">
      {game.variant === "crazyhouse" && (
        <ReservePanel
          reserves={game.reserves}
          color={color}
          selectedDropType={selectedDropType}
          disabled={disabled}
          onSelect={onReserveSelect}
        />
      )}
      {game.variant === "nuke" && (
        <NukePanel game={game} color={color} disabled={disabled} targeting={nukeTargeting} onTarget={onNukeTarget} />
      )}
      {game.variant === "tycoon" && (
        <TycoonPanel
          game={game}
          color={color}
          disabled={disabled}
          selectedAction={selectedTycoonAction}
          onSelect={onTycoonSelect}
          onInstant={onTycoonInstant}
        />
      )}
    </section>
  );
}

function NukePanel({ game, color, disabled, targeting, onTarget }) {
  const state = game.nuke?.[color] || { charge: 0, active: null };
  const active = state.active;
  const charge = Math.min(3, Number(state.charge) || 0);
  return (
    <section className="variant-control-card nuke-panel">
      <h2>Nuke</h2>
      <div className="nuke-meter" aria-label={`Nuke charge ${charge}`}>
        {[1, 2, 3].map((level) => <span key={level} className={charge >= level ? "charged" : ""} />)}
      </div>
      <p className="subtle">Charge: <strong>{charge}</strong> / 3</p>
      {active ? (
        <p className="subtle danger-text">Active radius {active.radius}. About {Math.max(0, Math.ceil((active.targetTurn - (game.turnToken || 0)) / 2))} enemy move(s) left.</p>
      ) : (
        <button type="button" className={targeting ? "active" : ""} disabled={disabled || charge <= 0} onClick={onTarget}>
          {targeting ? "Choose target square" : "Launch Nuke"}
        </button>
      )}
    </section>
  );
}

function TycoonPanel({ game, color, disabled, selectedAction, onSelect, onInstant }) {
  const tycoon = game.tycoon || {};
  const money = tycoon.money?.[color] || 0;
  const maxMoney = tycoon.maxMoney?.[color] || 15;
  const production = tycoon.production?.[color] || 0;
  const storageLevel = tycoon.storageLevel?.[color] || 0;
  const productionLevel = tycoon.productionLevel?.[color] || 0;
  const costs = getTycoonCostsClient(storageLevel, productionLevel);
  const canBuy = (cost) => !disabled && money >= cost;

  return (
    <section className="variant-control-card tycoon-panel">
      <h2>Tycoon</h2>
      <div className="money-card">
        <strong>${money}</strong><span>/ ${maxMoney}</span>
        <small>Production +${production}</small>
      </div>
      {tycoon.lastIncome?.[color] > 0 && <p className="income-flash">+${tycoon.lastIncome[color]} silo income</p>}

      <div className="shop-section">
        <h3>Pieces</h3>
        <div className="shop-grid">
          {["pawn", "knight", "bishop", "rook", "queen"].map((type) => (
            <TycoonActionButton key={type} active={selectedAction === type} disabled={!canBuy(costs.pieces[type])} onClick={() => onSelect(type)} label={type} cost={costs.pieces[type]} />
          ))}
        </div>
      </div>

      <div className="shop-section">
        <h3>Defence</h3>
        <div className="shop-grid two">
          <TycoonActionButton active={selectedAction === "wall"} disabled={!canBuy(costs.wall)} onClick={() => onSelect("wall")} label="Wall" cost={costs.wall} />
          <TycoonActionButton active={selectedAction === "shield"} disabled={!canBuy(costs.shield)} onClick={() => onSelect("shield")} label="Shield" cost={costs.shield} />
        </div>
      </div>

      <div className="shop-section">
        <h3>Attack</h3>
        <TycoonActionButton active={selectedAction === "bomb"} disabled={!canBuy(costs.bomb)} onClick={() => onSelect("bomb")} label="Bomb" cost={costs.bomb} wide />
      </div>

      <div className="shop-section">
        <h3>Economy</h3>
        <div className="shop-grid two">
          <TycoonActionButton disabled={!canBuy(costs.storage)} onClick={() => onInstant("storage")} label={`Storage L${storageLevel + 1}`} cost={costs.storage} />
          <TycoonActionButton disabled={productionLevel >= 3 || !canBuy(costs.production)} onClick={() => onInstant("production")} label={`Production L${Math.min(3, productionLevel + 1)}`} cost={Number.isFinite(costs.production) ? costs.production : "Max"} />
        </div>
      </div>
      <p className="subtle action-hint">Buying does not end your turn. Move a piece when you are done shopping.</p>
      {selectedAction && <p className="subtle action-hint">Click the board to place/use {selectedAction}.</p>}
    </section>
  );
}

function TycoonActionButton({ label, cost, active, disabled, onClick, wide }) {
  return (
    <button type="button" className={`${active ? "active" : ""} ${wide ? "wide" : ""}`} disabled={disabled} onClick={onClick}>
      <span>{label}</span>
      <strong>{typeof cost === "number" ? `$${cost}` : cost}</strong>
    </button>
  );
}

function getTycoonCostsClient(storageLevel, productionLevel) {
  return {
    pieces: { pawn: 3, knight: 7, bishop: 7, rook: 10, queen: 15 },
    wall: 3,
    shield: 5,
    bomb: 5,
    storage: [5, 8, 12, 16, 22][storageLevel] || 28,
    production: [8, 14, 22][productionLevel] ?? Infinity
  };
}

function PredictPanel({ game, color }) {
  const round = game.predict?.round || 1;
  const whiteLocked = Boolean(game.predict?.pending?.white);
  const blackLocked = Boolean(game.predict?.pending?.black);
  return (
    <section className="variant-control-card predict-panel">
      <h2>Predict</h2>
      <p className="subtle">Round {round}. White locks first, black locks second, then both moves resolve.</p>
      <div className="predict-status-grid">
        <span className={whiteLocked ? "locked-pill" : "waiting-pill"}>White {whiteLocked ? "Locked" : "Waiting"}</span>
        <span className={blackLocked ? "locked-pill" : "waiting-pill"}>Black {blackLocked ? "Locked" : "Waiting"}</span>
      </div>
      <p className="subtle">{game.turn === color ? "Your turn to lock a move." : `${game.turn} is choosing.`}</p>
    </section>
  );
}

function ScoobyPanel({ game, color, disabled, selectedAction, onSelect }) {
  const scooby = game.scooby || {};
  const limits = scooby.trapLimits || { mine: 1, pitfall: 2, smoke: 1, decoy: 2, mindControl: 1 };
  const ownedCounts = Object.fromEntries(Object.keys(limits).map((type) => [type, (scooby.traps || []).filter((trap) => trap.owner === color && trap.type === type).length]));
  const actions = [
    { id: "mine", icon: "✹", label: "Mine" },
    { id: "pitfall", icon: "◌", label: "Pitfall" },
    { id: "smoke", icon: "☁", label: "Smoke" },
    { id: "decoy", icon: "◇", label: "Decoy" },
    { id: "mindControl", icon: "◈", label: "Mind Control" }
  ];
  return (
    <section className="variant-control-card scooby-panel">
      <h2>Scooby</h2>
      <p className="subtle">Pick a trap to place, or choose defuse and click any square.</p>
      <div className="scooby-action-grid">
        {actions.map((action) => {
          const left = Math.max(0, (limits[action.id] || 0) - (ownedCounts[action.id] || 0));
          return (
            <button
              key={action.id}
              type="button"
              disabled={disabled || left <= 0}
              className={selectedAction === action.id ? "active" : ""}
              onClick={() => onSelect(action.id)}
            >
              <span className={`trap-icon-preview ${color}`}>{action.icon}</span>
              <strong>{action.label}</strong>
              <small>{left} left</small>
            </button>
          );
        })}
        <button
          type="button"
          disabled={disabled}
          className={selectedAction === "defuse" ? "active" : ""}
          onClick={() => onSelect("defuse")}
        >
          <span className={`trap-icon-preview ${color}`}>✂</span>
          <strong>Defuse</strong>
          <small>Click any square</small>
        </button>
      </div>
    </section>
  );
}

function ReservePanel({ reserves, color, selectedDropType, disabled, onSelect }) {
  const pieces = (reserves?.[color] || []);
  const counts = pieces.reduce((acc, type) => {
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
  const order = ["queen", "rook", "bishop", "knight", "pawn"];
  const entries = order.filter((type) => counts[type]);

  return (
    <section className="reserve-panel">
      <h2>Reserve</h2>
      {entries.length === 0 ? (
        <p className="subtle">No captured pieces to drop.</p>
      ) : (
        <div className="reserve-buttons">
          {entries.map((type) => (
            <button
              key={type}
              type="button"
              className={selectedDropType === type ? "active" : ""}
              disabled={disabled}
              onClick={() => onSelect(type)}
              title={`Drop ${type}`}
            >
              <span>{PIECE_SYMBOLS[color]?.[type]}</span>
              <strong>×{counts[type]}</strong>
            </button>
          ))}
        </div>
      )}
      {selectedDropType && <p className="subtle">Click an empty square to drop a {selectedDropType}.</p>}
    </section>
  );
}

function VariantGuideModal({ variant, step, onStep, onClose }) {
  const steps = getVariantGuideSteps(variant);
  const current = steps[Math.min(step, steps.length - 1)];
  return (
    <div className="modal-backdrop tutorial-backdrop">
      <section className="modal-card tutorial-card">
        <TutorialArt art={current.art} />
        <h2>{current.title}</h2>
        <p>{current.body}</p>
        <div className="tutorial-dots">
          {steps.map((_, index) => <button key={index} className={index === step ? "active" : ""} onClick={() => onStep(index)} aria-label={`Guide step ${index + 1}`} />)}
        </div>
        <div className="modal-actions">
          <button type="button" onClick={() => onStep(Math.max(0, step - 1))} disabled={step === 0}>Back</button>
          {step < steps.length - 1 ? (
            <button className="primary" type="button" onClick={() => onStep(step + 1)}>Next</button>
          ) : (
            <button className="primary" type="button" onClick={onClose}>Play</button>
          )}
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </section>
    </div>
  );
}

function getVariantGuideSteps(variant) {
  if (variant === "chess960") {
    return [
      { title: "Chess960: shuffled back rank", body: "The major pieces start in a legal random order. Bishops are on opposite colours and the king starts between the rooks.", art: "chess960" },
      { title: "Normal goal", body: "After the opening position is generated, play normal chess and checkmate your opponent.", art: "normalGoal" }
    ];
  }
  if (variant === "crazyhouse") {
    return [
      { title: "Crazyhouse: captures become drops", body: "Captured pieces enter your reserve. On your turn you can move normally or drop a reserve piece onto an empty square.", art: "crazyhouse" },
      { title: "Drop rules", body: "Pawns cannot be dropped on the first or last rank. Drops cannot leave your own king in check.", art: "dropRules" }
    ];
  }
  if (variant === "kingOfTheHill") {
    return [
      { title: "King of the Hill", body: "You can still win by checkmate, but you also win immediately by moving your king to one of the four centre squares.", art: "kingHill" },
      { title: "The hill", body: "The hill is d4, e4, d5, and e5. Control the centre while keeping your king safe.", art: "hillSquares" }
    ];
  }
  if (variant === "atomic") {
    return [
      { title: "Atomic Chess: captures explode", body: "Every capture removes the captured piece, the capturing piece, and nearby non-pawn pieces around the capture square.", art: "atomic" },
      { title: "Destroy the king", body: "If an explosion destroys the enemy king, you win. Checkmate can still win normally.", art: "atomicKing" }
    ];
  }
  if (variant === "nuke") {
    return [
      { title: "Nuke: capture to charge", body: "Every normal capture adds one charge. Charge controls the circular blast radius, up to radius 3.", art: "nukeCharge" },
      { title: "Launch and survive", body: "Launching uses your turn. The opponent gets three moves before detonation. Rooks block rank/file blast lines.", art: "nukeLaunch" }
    ];
  }
  if (variant === "tycoon") {
    return [
      { title: "Tycoon: control the silos", body: "Pieces sitting in the highlighted silo squares generate money at the start of your turn after both players have moved once.", art: "tycoonSilos" },
      { title: "Buy upgrades", body: "Spend money on pieces, walls, shields, bombs, storage, and production. You can buy multiple things; only moving a piece ends your turn.", art: "tycoonShop" }
    ];
  }
  if (variant === "predict") {
    return [
      { title: "Predict: lock moves in the dark", body: "White chooses and locks a move first. Black then locks a move without seeing White's destination.", art: "predictLock" },
      { title: "Then resolve the pair", body: "Once both are locked, White's move resolves first and Black's resolves second if it is still legal.", art: "predictResolve" }
    ];
  }
  if (variant === "scooby") {
    return [
      { title: "Scooby: traps between the pieces", body: "On your turn you may move normally, place one hidden trap, or try to defuse a suspected trap square.", art: "scoobyTrapSet" },
      { title: "Pawns sniff out danger", body: "Your pawns detect traps in a 4-square cross around them. Mines, pitfalls, smoke, decoys, and mind control all have different payoffs.", art: "scoobyDetect" }
    ];
  }
  return [
    { title: "1. Choose a slice", body: "Pick XZ, XY, or YZ. Each button shows a different 2D board slice through the 3D cube.", art: "planes" },
    { title: "2. Scroll layers", body: "Use the scroll wheel to flick through the stacked layers like sheets of paper.", art: "layers" },
    { title: "3. Check ISO", body: "Use ISO when you need to see the whole cube and understand where pieces sit in 3D.", art: "iso" },
    { title: "4. Move in one plane", body: "Pieces move on one board plane at a time. A bishop can move diagonally across a slice, not through the cube.", art: "move" }
  ];
}

function TutorialArt({ art }) {
  if (art === "chess960") {
    const row = ["♗", "♞", "♕", "♜", "♔", "♝", "♞", "♖"];
    return <div className="tutorial-art variant-art variant-art-board">{row.map((piece, i) => <span key={i}>{piece}</span>)}</div>;
  }
  if (art === "crazyhouse") {
    return <div className="tutorial-art variant-art crazyhouse-art"><div className="mini-board-piece">♘</div><div className="reserve-tray"><span>♞</span><span>♟</span><span>♜</span></div><strong>Capture → Reserve</strong></div>;
  }
  if (art === "dropRules") {
    return <div className="tutorial-art variant-art drop-art"><div className="reserve-tray large"><span>♟</span><span>♞</span></div><div className="drop-target">Empty square</div><strong>Drop instead of moving</strong></div>;
  }
  if (art === "kingHill" || art === "hillSquares") {
    return <div className="tutorial-art variant-art hill-art">{Array.from({ length: 16 }).map((_, i) => <span key={i} className={[5,6,9,10].includes(i) ? "hill-centre" : ""}>{[5,6,9,10].includes(i) ? "♔" : ""}</span>)}</div>;
  }
  if (art === "atomic" || art === "atomicKing") {
    return <div className="tutorial-art variant-art atomic-art"><span className="atomic-piece">♕</span><span className="atomic-blast">✹</span><span className="atomic-piece black">♟</span><strong>Capture = explosion</strong></div>;
  }
  if (art === "normalGoal") {
    return <div className="tutorial-art variant-art normal-goal-art"><span>♔</span><span className="mate-arrow">→</span><span>♚</span><strong>Checkmate wins</strong></div>;
  }
  if (art === "nukeCharge" || art === "nukeLaunch") {
    return <div className="tutorial-art variant-art nuke-art"><span className="nuke-core">☢</span><span className="nuke-ring one" /><span className="nuke-ring two" /><span className="nuke-ring three" /><strong>{art === "nukeCharge" ? "Capture → charge" : "3 enemy moves → boom"}</strong></div>;
  }
  if (art === "tycoonSilos") {
    return <div className="tutorial-art variant-art tycoon-silo-art">{Array.from({ length: 64 }).map((_, i) => <span key={i} className={isTutorialSiloIndex(i) ? "tutorial-silo" : ""}>{isTutorialSiloIndex(i) ? "$" : ""}</span>)}</div>;
  }
  if (art === "tycoonShop") {
    return <div className="tutorial-art variant-art tycoon-shop-art"><div><strong>Pieces</strong><span>♙ ♘ ♖ ♕</span></div><div><strong>Defence</strong><span>▥ ⛨</span></div><div><strong>Attack</strong><span>✹</span></div><div><strong>Economy</strong><span>$ +</span></div></div>;
  }
  if (art === "predictLock" || art === "predictResolve") {
    return <div className="tutorial-art variant-art predict-art"><div className="predict-card white">♘ → ?</div><div className="predict-card black">♞ → ?</div><strong>{art === "predictLock" ? "Lock first, reveal later" : "White resolves, then Black"}</strong></div>;
  }
  if (art === "scoobyTrapSet" || art === "scoobyDetect") {
    return <div className="tutorial-art variant-art scooby-art"><div className="scooby-icons"><span>✹</span><span>◌</span><span>☁</span><span>◇</span><span>◈</span></div><strong>{art === "scoobyTrapSet" ? "Move, place, or defuse" : "Pawns detect nearby traps"}</strong></div>;
  }
  if (art === "planes") {
    return (
      <div className="tutorial-art tutorial-art--planes" data-art={art}>
        <div className="slice-graphic slice-xz">
          <span className="slice-label">XZ</span>
          <span className="slice-plane-board" />
        </div>
        <div className="slice-graphic slice-xy">
          <span className="slice-label">XY</span>
          <span className="slice-plane-board" />
        </div>
        <div className="slice-graphic slice-yz">
          <span className="slice-label">YZ</span>
          <span className="slice-plane-board" />
        </div>
        <div className="slice-axis-mini">
          <span className="axis-line axis-x">X</span>
          <span className="axis-line axis-y">Y</span>
          <span className="axis-line axis-z">Z</span>
        </div>
      </div>
    );
  }

  if (art === "layers") {
    return (
      <div className="tutorial-art tutorial-art--layers" data-art={art}>
        <div className="layer-flick-stack">
          <span className="flick-sheet sheet-1" />
          <span className="flick-sheet sheet-2" />
          <span className="flick-sheet sheet-3" />
          <span className="flick-sheet sheet-top" />
        </div>
        <div className="scroll-wheel-graphic">
          <span className="wheel-slot" />
          <span className="scroll-arrow up">↑</span>
          <span className="scroll-arrow down">↓</span>
        </div>
      </div>
    );
  }

  if (art === "iso") {
    return (
      <div className="tutorial-art tutorial-art--iso" data-art={art}>
        <div className="iso-cube-guide">
          <span className="cube-floor" />
          <span className="cube-side cube-side-x" />
          <span className="cube-side cube-side-y" />
          <span className="cube-piece cube-piece-a" />
          <span className="cube-piece cube-piece-b" />
          <span className="cube-axis cube-axis-x">X</span>
          <span className="cube-axis cube-axis-y">Y</span>
          <span className="cube-axis cube-axis-z">Z</span>
        </div>
      </div>
    );
  }

  return (
    <div className="tutorial-art tutorial-art--move" data-art={art}>
      <div className="bishop-slice-board">
        {Array.from({ length: 25 }).map((_, index) => <span key={index} className="bishop-cell" />)}
        <span className="bishop-piece-guide">♗</span>
        <span className="bishop-path path-a" />
        <span className="bishop-path path-b" />
        <span className="bishop-path path-c" />
      </div>
      <div className="no-plane-jump">
        <span className="jump-board front" />
        <span className="jump-board back" />
        <span className="jump-x">×</span>
      </div>
    </div>
  );
}

function isTutorialSiloIndex(index) {
  const row = Math.floor(index / 8);
  const col = index % 8;
  const z = 7 - row;
  return (([1, 2].includes(col) && [3, 4].includes(z)) || ([5, 6].includes(col) && [3, 4].includes(z)));
}

function parseDevLocation(args, startIndex = 0) {
  if (!Array.isArray(args) || args.length <= startIndex) return null;
  const first = String(args[startIndex] || "").trim();
  const chess = /^([a-h])([1-8])$/i.exec(first);
  if (chess) return { location: { x: chess[1].toLowerCase().charCodeAt(0) - 97, y: 0, z: Number(chess[2]) - 1 }, nextIndex: startIndex + 1 };
  const parts = first.replace(/[()\[\]{}]/g, "").split(/[,:/]/).map((part) => Number.parseInt(part.trim(), 10));
  if (parts.length === 3 && parts.every(Number.isInteger)) return { location: { x: parts[0], y: parts[1], z: parts[2] }, nextIndex: startIndex + 1 };
  if (args.length >= startIndex + 3) {
    const xyz = [args[startIndex], args[startIndex + 1], args[startIndex + 2]].map((part) => Number.parseInt(part, 10));
    if (xyz.every(Number.isInteger)) return { location: { x: xyz[0], y: xyz[1], z: xyz[2] }, nextIndex: startIndex + 3 };
  }
  return null;
}

function coordText(coord) {
  return `(${coord.x},${coord.y},${coord.z})`;
}

function buildVariantHighlights(game) {
  if (!game) return [];
  const highlights = [];
  const add = (pos, className, marker = "", markerClass = "") => {
    if (!pos || pos.y !== 0) return;
    highlights.push({ x: pos.x, y: 0, z: pos.z, className, marker, markerClass });
  };

  if (game.variant === "kingOfTheHill") {
    for (const pos of hillSquares()) add(pos, "hill-highlight", "", "");
  }

  if (game.variant === "tycoon") {
    for (const pos of siloSquares()) add(pos, "silo-highlight", "$", "silo-marker");
    for (const bomb of game.tycoon?.bombs || []) {
      const stage = countdownStage(bomb.targetTurn, game.turnToken);
      for (const pos of squareBlastSquares(bomb.centre, 1)) add(pos, `blast-warning ${stage}`, sameCoord(pos, bomb.centre) ? "✹" : "", "bomb-marker");
    }
  }

  if (game.variant === "nuke") {
    for (const color of ["white", "black"]) {
      const active = game.nuke?.[color]?.active;
      if (!active) continue;
      const stage = countdownStage(active.targetTurn, game.turnToken);
      for (const pos of circularBlastSquares(active.centre, active.radius, game)) add(pos, `nuke-warning ${stage}`, sameCoord(pos, active.centre) ? "☢" : "", "nuke-marker");
    }
  }

  if (game.variant === "scooby") {
    const iconMap = { mine: "✹", pitfall: "◌", smoke: "☁", decoy: "◇", mindControl: "◈" };
    for (const trap of game.scooby?.traps || []) {
      const type = trap.displayType || trap.type;
      add(trap.pos, trap.owner === game.turn ? "scooby-trap-own" : "scooby-trap-detected", iconMap[type] || "?", "scooby-trap-marker");
    }
    for (const smoke of game.scooby?.smokes || []) {
      for (let dx = -2; dx <= 2; dx += 1) {
        for (let dz = -2; dz <= 2; dz += 1) {
          const pos = { x: smoke.centre.x + dx, y: 0, z: smoke.centre.z + dz };
          if (pos.x >= 0 && pos.x < 8 && pos.z >= 0 && pos.z < 8) add(pos, "scooby-smoke-zone", dx === 0 && dz === 0 ? "☁" : "", "scooby-smoke-marker");
        }
      }
    }
  }

  for (const effect of game.effects?.explosions || []) {
    const squares = effect.type === "nuke" ? circularBlastSquares(effect.centre, effect.radius || 1, game) : squareBlastSquares(effect.centre, effect.radius || 1);
    for (const pos of squares) add(pos, "explosion-active", "", "");
  }

  return highlights;
}

function hillSquares() {
  return [{ x: 3, y: 0, z: 3 }, { x: 4, y: 0, z: 3 }, { x: 3, y: 0, z: 4 }, { x: 4, y: 0, z: 4 }];
}

function siloSquares() {
  return [
    { x: 1, y: 0, z: 3 }, { x: 1, y: 0, z: 4 }, { x: 2, y: 0, z: 3 }, { x: 2, y: 0, z: 4 },
    { x: 5, y: 0, z: 3 }, { x: 5, y: 0, z: 4 }, { x: 6, y: 0, z: 3 }, { x: 6, y: 0, z: 4 }
  ];
}

function circularBlastSquares(centre, radius, game = null) {
  const squares = [];
  if (!centre) return squares;
  for (let x = 0; x < 8; x += 1) {
    for (let z = 0; z < 8; z += 1) {
      const dx = x - centre.x;
      const dz = z - centre.z;
      const pos = { x, y: 0, z };
      if (dx * dx + dz * dz <= radius * radius && !isClientNukeBlockedByRook(game, centre, pos)) squares.push(pos);
    }
  }
  return squares;
}

function isClientNukeBlockedByRook(game, centre, target) {
  if (!game) return false;
  const sameFile = centre.x === target.x && centre.z !== target.z;
  const sameRank = centre.z === target.z && centre.x !== target.x;
  if (!sameFile && !sameRank) return false;
  const stepX = Math.sign(target.x - centre.x);
  const stepZ = Math.sign(target.z - centre.z);
  let x = centre.x + stepX;
  let z = centre.z + stepZ;
  while (x !== target.x || z !== target.z) {
    const blocker = (game.pieces || []).find((piece) => piece.x === x && piece.y === 0 && piece.z === z);
    if (blocker?.type === "rook") return true;
    x += stepX;
    z += stepZ;
  }
  return false;
}

function squareBlastSquares(centre, radius) {
  const squares = [];
  if (!centre) return squares;
  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dz = -radius; dz <= radius; dz += 1) {
      const pos = { x: centre.x + dx, y: 0, z: centre.z + dz };
      if (pos.x >= 0 && pos.x < 8 && pos.z >= 0 && pos.z < 8) squares.push(pos);
    }
  }
  return squares;
}

function countdownStage(targetTurn, turnToken) {
  const remaining = Math.max(0, Number(targetTurn || 0) - Number(turnToken || 0));
  if (remaining > 4) return "yellow";
  if (remaining > 2) return "orange";
  return "red";
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="loading-box error-box">
          <strong>{UI_TEXT.notices.isoFailed}</strong>
          <p>{String(this.state.error.message || this.state.error)}</p>
          <p>{UI_TEXT.notices.usePlaneView}</p>
        </div>
      );
    }

    return this.props.children;
  }
}

function TimerBar({ game, now }) {
  const clocks = getDisplayedClocks(game, now);
  return (
    <div className="timer-bar" aria-label="Game clocks">
      <div className={`clock-card white ${game.turn === "white" && game.status === "playing" ? "active" : ""}`}>
        <span>{UI_TEXT.labels.white}</span>
        <strong>{formatClock(clocks.white)}</strong>
      </div>
      <div className="timer-divider">⏱</div>
      <div className={`clock-card black ${game.turn === "black" && game.status === "playing" ? "active" : ""}`}>
        <span>{UI_TEXT.labels.black}</span>
        <strong>{formatClock(clocks.black)}</strong>
      </div>
    </div>
  );
}

function getDisplayedClocks(game, now) {
  const clocks = { ...(game.clocks || { white: 0, black: 0 }) };
  if (game.status === "playing" && game.lastTurnStartedAt && clocks[game.turn] != null) {
    clocks[game.turn] = Math.max(0, clocks[game.turn] - Math.max(0, now - game.lastTurnStartedAt));
  }
  return clocks;
}

function formatClock(ms) {
  const totalSeconds = Math.ceil(Math.max(0, ms || 0) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatMoveEntry(move) {
  if (move.nukeLaunch) return <><strong>{move.pieceColor} nuke</strong> launch radius {move.radius} at ({move.to.x},{move.to.y},{move.to.z})</>;
  if (move.nukeExplosion) return <><strong>{move.pieceColor} nuke</strong> explosion radius {move.radius} at ({move.to.x},{move.to.y},{move.to.z})</>;
  if (move.tycoon) return <><strong>{move.pieceColor} tycoon</strong> {move.tycoonAction}{move.to ? ` at (${move.to.x},${move.to.y},${move.to.z})` : ""}</>;
  if (move.tycoonExplosion) return <><strong>{move.pieceColor} bomb</strong> explosion at ({move.to.x},{move.to.y},{move.to.z})</>;
  if (move.scooby) return <><strong>{move.pieceColor} scooby</strong> {move.scoobyAction}{move.to ? ` at (${move.to.x},${move.to.y},${move.to.z})` : ""}</>;
  return <><strong>{move.pieceColor} {move.promotedTo ? "pawn" : move.pieceType}</strong> {move.drop ? "drop" : `(${move.from.x},${move.from.y},${move.from.z}) →`} ({move.to.x},{move.to.y},{move.to.z}){move.captured ? ` × ${move.captured.type}${move.shieldBlocked ? " shield" : ""}` : ""}{move.castle ? " castle" : ""}{move.enPassant ? " en passant" : ""}{move.promotedTo ? ` = ${move.promotedTo}` : ""}{move.scoobyTrap ? ` | trap: ${move.scoobyTrap.type}` : ""}{Array.isArray(move.atomicRemoved) && move.atomicRemoved.length ? ` explosion ${move.atomicRemoved.length}` : ""}</>;
}

function GameChat({ chat, draft, onDraftChange, onSend, onForfeit, canForfeit }) {
  const chatMessagesRef = useRef(null);

  useEffect(() => {
    const node = chatMessagesRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [chat.length]);

  return (
    <section className="game-chat-panel" aria-label={UI_TEXT.headings.chat}>
      <div className="game-chat-header">
        <h2>{UI_TEXT.headings.chat}</h2>
        {canForfeit && <button className="danger-button forfeit-button" type="button" onClick={onForfeit}>{UI_TEXT.buttons.forfeit}</button>}
      </div>
      <div className="chat-messages" ref={chatMessagesRef} aria-live="polite">
        {chat.length === 0 ? (
          <p className="chat-empty">{UI_TEXT.notices.noChatYet}</p>
        ) : (
          chat.slice(-80).map((message, index) => (
            <div key={message.id} className={`chat-line ${message.color} ${index % 2 === 0 ? "even" : "odd"}`}>
              <span className="chat-prefix">[{formatChatTime(message.time)}] [{message.name}]:</span>
              <span className="chat-body">{message.body}</span>
            </div>
          ))
        )}
      </div>
      <form className="chat-form" onSubmit={onSend}>
        <input
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder={UI_TEXT.labels.chatPlaceholder}
          maxLength={240}
        />
        <button type="submit">{UI_TEXT.buttons.sendChat}</button>
      </form>
    </section>
  );
}

function formatChatTime(time) {
  const date = new Date(time || Date.now());
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function MatchReviewControls({
  reviewIndex,
  maxReviewIndex,
  reviewPlaying,
  onSetIndex,
  onPlayToggle
}) {
  return (
    <section className="match-review-dock" aria-label={UI_TEXT.headings.matchReview}>
      <div className="match-review-header">
        <h2>{UI_TEXT.headings.matchReview}</h2>
        <span>{UI_TEXT.labels.move} {reviewIndex} / {maxReviewIndex}</span>
      </div>
      <input
        className="review-scrubber compact-scrubber"
        type="range"
        min="0"
        max={maxReviewIndex}
        value={reviewIndex}
        onChange={(event) => onSetIndex(Number(event.target.value))}
        aria-label={`${UI_TEXT.labels.move} ${reviewIndex} / ${maxReviewIndex}`}
      />
      <div className="cassette-controls" aria-label={UI_TEXT.headings.matchReview}>
        <IconButton label={UI_TEXT.buttons.jumpStart} onClick={() => onSetIndex(0)} disabled={reviewIndex <= 0} icon="skip-back" />
        <IconButton label={UI_TEXT.buttons.backMove} onClick={() => onSetIndex(reviewIndex - 1)} disabled={reviewIndex <= 0} icon="step-back" />
        <IconButton
          label={reviewPlaying ? UI_TEXT.buttons.pauseReview : UI_TEXT.buttons.playReview}
          onClick={onPlayToggle}
          icon={reviewPlaying ? "pause" : "play"}
          primary
        />
        <IconButton label={UI_TEXT.buttons.nextMove} onClick={() => onSetIndex(reviewIndex + 1)} disabled={reviewIndex >= maxReviewIndex} icon="step-forward" />
        <IconButton label={UI_TEXT.buttons.jumpEnd} onClick={() => onSetIndex(maxReviewIndex)} disabled={reviewIndex >= maxReviewIndex} icon="skip-forward" />
      </div>
    </section>
  );
}

function IconButton({ label, icon, onClick, disabled, primary }) {
  return (
    <button
      className={`icon-button ${primary ? "primary" : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      <ReviewIcon icon={icon} />
    </button>
  );
}

function ReviewIcon({ icon }) {
  if (icon === "skip-back") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 4h2v16H5z" />
        <path d="M19 5v14L8 12z" />
      </svg>
    );
  }

  if (icon === "step-back") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18 5v14L7 12z" />
      </svg>
    );
  }

  if (icon === "pause") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 5h4v14H7z" />
        <path d="M13 5h4v14h-4z" />
      </svg>
    );
  }

  if (icon === "step-forward") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 5v14l11-7z" />
      </svg>
    );
  }

  if (icon === "skip-forward") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M17 4h2v16h-2z" />
        <path d="M5 5v14l11-7z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="7" />
    </svg>
  );
}

function ReviewControls({ onStartReview }) {
  return (
    <div className="review-panel">
      <h2>{UI_TEXT.headings.matchReview}</h2>
      <button className="primary" onClick={onStartReview}>{UI_TEXT.buttons.reviewMatch}</button>
    </div>
  );
}

function GameOverModal({ game, onReturnHome, onReplay, onReview, onClose }) {
  const title = getGameOverTitle(game);
  const winnerText = game.winner ? `${capitalise(game.winner)} player wins.` : "No winner.";

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <section className="game-over-modal pop-modal">
        <button className="modal-close" onClick={onClose} aria-label={UI_TEXT.buttons.closeOverlay}>×</button>
        <p className="modal-kicker">{game.status}</p>
        <h2>{title}</h2>
        <p className="winner-line">{winnerText}</p>
        <p className="modal-message">{game.message}</p>
        <p className="subtle">{UI_TEXT.gameOver.reviewHint}</p>
        <div className="modal-actions">
          <button onClick={onReturnHome}>{UI_TEXT.buttons.returnHome}</button>
          <button className="primary" onClick={onReplay}>{UI_TEXT.buttons.newRoom}</button>
          <button onClick={onReview}>{UI_TEXT.buttons.reviewMatch}</button>
        </div>
      </section>
    </div>
  );
}

function ConfirmModal({ title, body, confirmLabel, cancelLabel, onConfirm, onCancel }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <section className="game-over-modal pop-modal confirm-modal">
        <h2>{title}</h2>
        <p className="modal-message">{body}</p>
        <div className="modal-actions two-actions">
          <button onClick={onCancel}>{cancelLabel}</button>
          <button className="danger-button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}

function getGameOverTitle(game) {
  if (game.status === "abandoned") return UI_TEXT.gameOver.abandonedTitle;
  if (game.timeout) return UI_TEXT.gameOver.timeoutTitle;
  if (game.forfeit) return UI_TEXT.gameOver.forfeitTitle;
  if (game.checkmate) return UI_TEXT.gameOver.checkmateTitle;
  if (game.stalemate) return UI_TEXT.gameOver.stalemateTitle;
  return UI_TEXT.gameOver.finishedTitle;
}

function LayerRailControl({ view, layer, onSelect }) {
  const disabled = view === "ISO";

  return (
    <div className={`layer-rail ${disabled ? "disabled" : ""}`} aria-label="Layer selector">
      <span className="layer-rail-title">{disabled ? UI_TEXT.labels.layer : layerLabel(view)}</span>
      <div className="layer-rail-buttons">
        {[7, 6, 5, 4, 3, 2, 1, 0].map((candidate) => (
          <button
            key={candidate}
            className={candidate === layer && !disabled ? "active" : ""}
            onClick={() => onSelect(candidate)}
            disabled={disabled}
            title={disabled ? "Layers are only used in plane views" : `${layerLabel(view)} ${candidate}`}
          >
            {candidate}
          </button>
        ))}
      </div>
    </div>
  );
}

function OrientationGizmo({ view, layer, isoAxes }) {
  const layout = getOrientationLayout(view, isoAxes);

  return (
    <div className={`orientation-gizmo orientation-${view.toLowerCase()}`} aria-label={`Current view ${view}`}>
      <div className="gizmo-origin" />
      {Object.entries(layout.axes).map(([axis, definition]) => {
        const axisClass = typeof definition === "string" ? definition : definition.className;
        const axisStyle = typeof definition === "string" ? undefined : definition.style;

        return (
          <div key={axis} className={`gizmo-axis axis-${axis} ${axisClass}`} style={axisStyle}>
            <span className="gizmo-line" />
            <strong>{axis.toUpperCase()}</strong>
          </div>
        );
      })}
      <div className="gizmo-view-label">
        <strong>{view}</strong>
        <span>{layout.caption(view, layer)}</span>
      </div>
    </div>
  );
}

function getOrientationLayout(view, isoAxes) {
  if (view === "XZ") {
    return {
      axes: { x: "axis-right", z: "axis-up", y: "axis-out" },
      caption: (_, layer) => `y=${layer}`
    };
  }

  if (view === "XY") {
    return {
      axes: { x: "axis-right", y: "axis-up", z: "axis-out" },
      caption: (_, layer) => `z=${layer}`
    };
  }

  if (view === "YZ") {
    return {
      axes: { z: "axis-right", y: "axis-up", x: "axis-out" },
      caption: (_, layer) => `x=${layer}`
    };
  }

  if (isoAxes) {
    return {
      axes: Object.fromEntries(
        Object.entries(isoAxes).map(([axis, axisData]) => [
          axis,
          {
            className: "axis-dynamic",
            style: {
              "--axis-angle": `${axisData.angle}deg`,
              "--axis-length": `${axisData.length}px`,
              opacity: axisData.opacity
            }
          }
        ])
      ),
      caption: () => "orbit"
    };
  }

  return {
    axes: { x: "axis-iso-x", y: "axis-up", z: "axis-iso-z" },
    caption: () => "orbit"
  };
}


function getClientMembership(game, socketId) {
  if (!game || !socketId) return null;
  if (game.players?.white?.id === socketId) return { role: "player", color: "white" };
  if (game.players?.black?.id === socketId) return { role: "player", color: "black" };
  if ((game.spectators || []).some((spectator) => spectator.id === socketId)) return { role: "spectator", color: "spectator" };
  return null;
}

function PlayerLine({ label, player, active }) {
  return (
    <div className={`player-line ${active ? "active" : ""}`}>
      <span>{label}</span>
      <strong>{player?.name || UI_TEXT.labels.waiting}</strong>
    </div>
  );
}

function layerLabel(view) {
  if (view === "XZ") return "Y layer";
  if (view === "XY") return "Z layer";
  return "X layer";
}

function sameCoord(a, b) {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

function key(coord) {
  return `${coord.x},${coord.y},${coord.z}`;
}

function capitalise(value) {
  return String(value || "").slice(0, 1).toUpperCase() + String(value || "").slice(1);
}


function parseCommandLine(raw) {
  const tokens = [];
  const pattern = /"([^"]*)"|'([^']*)'|\S+/g;
  let match;
  while ((match = pattern.exec(String(raw || ""))) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[0]);
  }
  return tokens;
}

function shouldClearLocalSelection(previousGame, nextGame) {
  if (!previousGame || !nextGame) return true;
  if (previousGame.roomCode !== nextGame.roomCode) return true;
  if (previousGame.variant !== nextGame.variant) return true;
  if (previousGame.status !== nextGame.status) return true;
  if (previousGame.turn !== nextGame.turn) return true;

  const previousMoves = previousGame.moveHistory?.length || 0;
  const nextMoves = nextGame.moveHistory?.length || 0;
  if (previousMoves !== nextMoves) return true;

  const previousPieces = previousGame.pieces?.length || 0;
  const nextPieces = nextGame.pieces?.length || 0;
  if (previousPieces !== nextPieces) return true;

  return false;
}

function isTurnOnlyMessage(message) {
  return /^(white|black) to move\.?$/i.test(String(message || "").trim());
}
