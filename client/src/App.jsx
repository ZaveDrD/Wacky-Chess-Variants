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
import { DEV_CONSOLE_UNLOCK_SEQUENCE, findDevCommand, applyCommandPrefix, getDevCommandHelp, getDevCommandListLines } from "./game/devCommands.js";
import { playSoundEffect, unlockAudio } from "./game/sound.js";
import { profileIconUrl, getModeStats, formatModeStats, formatDateShort, formatElapsed, getTimeControlDescription, getAIDifficultyDescription, getVariantCategory, censorText, getViewportDevTouchZone, parseDevLocation, coordText, hillSquares, siloSquares, circularBlastSquares, squareBlastSquares, countdownStage, getDisplayedClocks, formatClock, formatChatTime, getClientMembership, layerLabel, sameCoord, key, capitalise, parseCommandLine, shouldClearLocalSelection, isTurnOnlyMessage } from "./game/uiHelpers.js";
import { DevFxLayer } from "./components/DevFxLayer.jsx";
import { NetworkDashboardModal } from "./components/NetworkDashboardModal.jsx";
import { VariantControls } from "./components/VariantPanels.jsx";
import { FriendsDrawer, FriendMessageWindow, ChallengeNotice, PunishmentNoticeModal, PublicProfileModal, ReportCaseModal } from "./components/SocialPanels.jsx";
import { AccountModal, ProfileAvatar, GuestAvatar, SettingsButton } from "./components/AccountUI.jsx";
import { ChoiceGallery, QueueSearchPanel, MatchFoundOverlay, LeaderboardPanel } from "./components/LobbyPanels.jsx";
import { TimerBar, GameChat, MatchReviewControls, GameOverModal, ConfirmModal, LayerRailControl, OrientationGizmo, PlayerLine } from "./components/GameShell.jsx";

const VIEWS = ["XZ", "XY", "YZ", "ISO"];
const REVIEW_PLAY_DELAY_MS = 650;
const MOBILE_DEV_TOUCH_SEQUENCE = ["topLeft", "topRight", "bottomLeft", "bottomRight", "centre"];

export default function App() {
  const [name, setName] = useState(localStorage.getItem("playerName") || "");
  const [account, setAccount] = useState(null);
  const [accountToken, setAccountToken] = useState(localStorage.getItem("tclAccountToken") || "");
  const [accountMode, setAccountMode] = useState("login");
  const [accountForm, setAccountForm] = useState({ email: "", username: "", login: "", password: "" });
  const [accountEditForm, setAccountEditForm] = useState({ username: "", email: "", currentPassword: "", newPassword: "", profileIcon: "lab-pawn.svg" });
  const [accountMessage, setAccountMessage] = useState("");
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [profileIcons, setProfileIcons] = useState(["lab-pawn.svg"]);
  const [deviceId] = useState(() => {
    const existing = localStorage.getItem("tclDeviceId");
    if (existing) return existing;
    const next = crypto.randomUUID ? crypto.randomUUID() : `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("tclDeviceId", next);
    return next;
  });
  const [punishmentNotice, setPunishmentNotice] = useState(null);
  const [appealText, setAppealText] = useState("");
  const [socialOpen, setSocialOpen] = useState(false);
  const [socialState, setSocialState] = useState(null);
  const [friendTarget, setFriendTarget] = useState("");
  const [friendChatTarget, setFriendChatTarget] = useState(null);
  const [friendMessageDraft, setFriendMessageDraft] = useState("");
  const [challengeNotice, setChallengeNotice] = useState(null);
  const [leaderboard, setLeaderboard] = useState(null);
  const [leaderboardScope, setLeaderboardScope] = useState("month");
  const [publicProfile, setPublicProfile] = useState(null);
  const [reportCase, setReportCase] = useState(null);
  const [profileMenu, setProfileMenu] = useState(null);
  const [matchFoundOverlay, setMatchFoundOverlay] = useState(null);
  const [roomInput, setRoomInput] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [color, setColor] = useState(null);
  const [role, setRole] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(localStorage.getItem("selectedVariant") || "normal");
  const [selectedTimeControl, setSelectedTimeControl] = useState(localStorage.getItem("selectedTimeControl") || "rapid");
  const [selectedGameMode, setSelectedGameMode] = useState(localStorage.getItem("selectedGameMode") || "online");
  const [homePanel, setHomePanel] = useState(localStorage.getItem("homePanel") || "online");
  const [homeChooser, setHomeChooser] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [censorContent, setCensorContent] = useState(localStorage.getItem("censorContent") === "true");
  const [queueStartedAt, setQueueStartedAt] = useState(null);
  const [selectedAIDifficulty, setSelectedAIDifficulty] = useState(localStorage.getItem("selectedAIDifficulty") || "medium");
  const [aiAvailability, setAIAvailability] = useState({ easy: true, medium: true, hard: true });
  const [networkDashboard, setNetworkDashboard] = useState(null);
  const [networkMetrics, setNetworkMetrics] = useState(null);
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
  const [feedbackOverlay, setFeedbackOverlay] = useState(null);
  const [devFxClass, setDevFxClass] = useState("");
  const [devFxItems, setDevFxItems] = useState([]);
  const [devCosmetics, setDevCosmetics] = useState({ pieces: {}, icons: {}, curses: {}, players: {} });
  const devSequenceIndexRef = useRef(0);
  const devTouchSequenceIndexRef = useRef(0);
  const devTouchLastAtRef = useRef(0);
  const previousGameRef = useRef(null);
  const previousChatLengthRef = useRef(0);
  const previousClockWarningRef = useRef(null);

  useEffect(() => {
    socket.on("connect", () => {
      setNotice(UI_TEXT.notices.connected);
      socket.emit("identifyDevice", { deviceId });
      socket.emit("requestAIAvailability");
      socket.emit("requestProfileIcons");
      const storedToken = localStorage.getItem("tclAccountToken") || accountToken;
      if (storedToken) socket.emit("accountSession", { token: storedToken });
    });
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
      setQueueStartedAt(null);
      setNotice(`Lab Room created: ${newRoomCode}`);
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
      setQueueStartedAt(null);
      setNotice(playerColor === "spectator" ? `Spectating Lab Room: ${newRoomCode}` : `Joined Lab Room: ${newRoomCode}`);
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
        setQueueStartedAt((current) => current || Date.now());
        setNotice(status.scope === "any" ? "Searching all open lab queues..." : "Searching selected experiment queue...");
      } else if (status.matched) {
        playSoundEffect("matchFound", { enabled: soundEnabled, volume: soundVolume });
        setQueueStartedAt(null);
        if (status.match) {
          setMatchFoundOverlay(status.match);
          window.setTimeout(() => setMatchFoundOverlay((current) => current?.roomCode === status.match.roomCode ? null : current), 2500);
        }
        setNotice(`Matched in Lab Room ${status.roomCode}.`);
      } else if (status.cancelled) {
        setQueueStartedAt(null);
        setNotice("Open Lab Queue cancelled.");
      }
    });
    socket.on("invalidMove", (message) => { setNotice(message); playSoundEffect("illegal", { enabled: soundEnabled, volume: soundVolume }); });
    socket.on("chatError", (message) => { setNotice(message || UI_TEXT.notices.chatFailed); playSoundEffect("illegal", { enabled: soundEnabled, volume: soundVolume }); });
    socket.on("devCommandResult", (result = {}) => {
      if (result.unlocked) setDevConsoleUnlocked(true);
      if (result.networkDashboard) {
        setNetworkDashboard(result.networkDashboard);
        socket.emit("devNetworkMetrics", result.networkDashboard);
      }
      if (result.reportCase) setReportCase(result.reportCase);
      const lines = result.lines || [result.ok ? "OK" : "Command failed."];
      if (lines.length) appendDevLines(lines.map((line) => result.ok === false ? `! ${line}` : String(line)));
    });

    socket.on("accountAuthenticated", ({ account: nextAccount, token } = {}) => {
      if (token) {
        localStorage.setItem("tclAccountToken", token);
        setAccountToken(token);
      }
      setAccount(nextAccount || null);
      if (nextAccount) {
        setAccountEditForm((current) => ({
          ...current,
          username: nextAccount.username || "",
          email: nextAccount.email || "",
          profileIcon: nextAccount.profile?.icon || "lab-pawn.svg",
          currentPassword: "",
          newPassword: ""
        }));
      }
      if (nextAccount?.username) {
        setName(nextAccount.username);
        localStorage.setItem("playerName", nextAccount.username);
      }
      setAccountMessage(accountMode === "register" ? UI_TEXT.account.created : UI_TEXT.account.loggedIn);
    });

    socket.on("accountUpdated", ({ account: nextAccount } = {}) => {
      if (!nextAccount) return;
      setAccount(nextAccount);
      setName(nextAccount.username || name);
      setAccountEditForm((current) => ({
        ...current,
        username: nextAccount.username || "",
        email: nextAccount.email || "",
        profileIcon: nextAccount.profile?.icon || current.profileIcon || "lab-pawn.svg",
        currentPassword: "",
        newPassword: ""
      }));
      setAccountMessage(UI_TEXT.account.updated);
    });

    socket.on("profileIcons", ({ icons } = {}) => {
      if (Array.isArray(icons) && icons.length) setProfileIcons(icons);
    });

    socket.on("accountError", (message) => {
      setAccountMessage(message || UI_TEXT.account.authFailed);
      playSoundEffect("illegal", { enabled: soundEnabled, volume: soundVolume });
    });

    socket.on("accountSessionExpired", () => {
      localStorage.removeItem("tclAccountToken");
      setAccountToken("");
      setAccount(null);
      setAccountMessage(UI_TEXT.account.sessionExpired);
    });

    socket.on("accountLoggedOut", () => {
      localStorage.removeItem("tclAccountToken");
      setAccountToken("");
      setAccount(null);
      setAccountMessage(UI_TEXT.account.loggedOut);
    });

    socket.on("devKickedHome", ({ reason } = {}) => {
      returnHome();
      setNotice(reason || "You've been kicked.");
    });

    socket.on("devRoomClosed", ({ reason } = {}) => {
      returnHome();
      setNotice(reason || "Your room was closed.");
    });

    socket.on("aiAvailability", (availability = {}) => {
      setAIAvailability((current) => ({ ...current, ...availability }));
    });

    socket.on("networkMetrics", (metrics = {}) => {
      setNetworkMetrics(metrics);
    });

    socket.on("punishmentNotice", (payload = {}) => {
      setPunishmentNotice(payload);
    });
    socket.on("appealSubmitted", () => {
      setAppealText("");
      setNotice(UI_TEXT.reports.appealSubmitted);
    });
    socket.on("appealError", (message) => setNotice(message));
    socket.on("socialState", (state = {}) => setSocialState(state));
    socket.on("socialError", (message) => setNotice(message));
    socket.on("socialNotice", (message) => setNotice(message));
    socket.on("challengeNotice", ({ challenge } = {}) => setChallengeNotice(challenge));
    socket.on("leaderboardData", (data = {}) => setLeaderboard(data));
    socket.on("publicProfile", (profile = {}) => setPublicProfile(profile));
    socket.on("profileError", (message) => setNotice(message));

    socket.on("devForcedVisual", ({ kind, args = [], from } = {}) => {
      if (kind === "fx") {
        triggerDevFx(args, { forcedBy: from || "Developer" });
        return;
      }
      if (kind === "cosmetic") {
        triggerDevCosmetic(args, { forcedBy: from || "Developer" });
      }
    });

    socket.on("shoutMessage", ({ message, from } = {}) => {
      const body = String(message || "").trim();
      if (!body) return;
      setShoutOverlay({ message: body, from: from || "Developer", id: Date.now() });
      playSoundEffect("shout", { enabled: soundEnabled, volume: soundVolume });
      window.setTimeout(() => setShoutOverlay((current) => current?.message === body ? null : current), 4200);
    });

    socket.emit("requestAIAvailability");

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
      socket.off("accountAuthenticated");
      socket.off("accountUpdated");
      socket.off("profileIcons");
      socket.off("accountError");
      socket.off("accountSessionExpired");
      socket.off("accountLoggedOut");
      socket.off("devKickedHome");
      socket.off("devRoomClosed");
      socket.off("aiAvailability");
      socket.off("networkMetrics");
      socket.off("punishmentNotice");
      socket.off("appealSubmitted");
      socket.off("appealError");
      socket.off("socialState");
      socket.off("socialError");
      socket.off("socialNotice");
      socket.off("challengeNotice");
      socket.off("leaderboardData");
      socket.off("publicProfile");
      socket.off("profileError");
      socket.off("devForcedVisual");
      socket.off("shoutMessage");
      socket.off("legalMoves");
    };
  }, [soundEnabled, soundVolume, deviceId, accountToken]);

  useEffect(() => {
    socket.emit("clientPresence", {
      name: name.trim() || "Player",
      state: game ? "room" : "lobby",
      roomCode: game?.roomCode || roomCode || ""
    });
  }, [game?.roomCode, roomCode, name]);

  useEffect(() => {
    const id = window.setInterval(() => setClockTick(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    socket.emit("identifyDevice", { deviceId });
    socket.emit("requestProfileIcons");
    if (accountToken) {
      socket.emit("accountSession", { token: accountToken });
      socket.emit("requestSocialState", { token: accountToken });
    }
  }, []);

  useEffect(() => {
    if (!leaderboard && homePanel !== "leaderboard") return;
    socket.emit("requestLeaderboard", { variant: selectedVariant, scope: leaderboardScope });
  }, [homePanel, selectedVariant, leaderboardScope]);

  useEffect(() => {
    if (!accountToken) return;
    socket.emit("requestSocialState", { token: accountToken });
    const id = window.setInterval(() => socket.emit("requestSocialState", { token: accountToken }), 8000);
    return () => window.clearInterval(id);
  }, [accountToken]);

  useEffect(() => {
    if (!networkDashboard) return undefined;
    socket.emit("devNetworkMetrics", networkDashboard);
    const id = window.setInterval(() => socket.emit("devNetworkMetrics", networkDashboard), 1000);
    return () => window.clearInterval(id);
  }, [networkDashboard]);

  useEffect(() => {
    if (aiAvailability[selectedAIDifficulty] !== false) return;
    const fallback = AI_DIFFICULTY_OPTIONS.find((difficulty) => aiAvailability[difficulty.id] !== false)?.id || "easy";
    setSelectedAIDifficulty(fallback);
  }, [aiAvailability, selectedAIDifficulty]);

  useEffect(() => {
    function openDevConsoleFromHiddenInput(event) {
      devSequenceIndexRef.current = 0;
      devTouchSequenceIndexRef.current = 0;
      devTouchLastAtRef.current = 0;
      setDevConsoleOpen(true);
      event?.preventDefault?.();
    }

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
          openDevConsoleFromHiddenInput(event);
        } else {
          devSequenceIndexRef.current = nextIndex;
        }
        return;
      }

      devSequenceIndexRef.current = event.key === sequence[0] ? 1 : 0;
    }

    function handleViewportDevTouch(event) {
      if (devConsoleOpen) return;
      if (event.defaultPrevented) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;

      const interactiveTag = event.target?.closest?.("input, textarea, select, [contenteditable='true']");
      if (interactiveTag) return;

      const zone = getViewportDevTouchZone(event.clientX, event.clientY);
      if (!zone) return;

      const now = Date.now();
      if (now - devTouchLastAtRef.current > 5000) devTouchSequenceIndexRef.current = 0;
      devTouchLastAtRef.current = now;

      const expected = MOBILE_DEV_TOUCH_SEQUENCE[devTouchSequenceIndexRef.current];
      if (zone === expected) {
        const nextIndex = devTouchSequenceIndexRef.current + 1;
        if (nextIndex >= MOBILE_DEV_TOUCH_SEQUENCE.length) {
          openDevConsoleFromHiddenInput(event);
        } else {
          devTouchSequenceIndexRef.current = nextIndex;
        }
        return;
      }

      devTouchSequenceIndexRef.current = zone === MOBILE_DEV_TOUCH_SEQUENCE[0] ? 1 : 0;
    }

    window.addEventListener("keydown", handleGlobalKeyDown);
    window.addEventListener("pointerdown", handleViewportDevTouch, { passive: false });
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
      window.removeEventListener("pointerdown", handleViewportDevTouch);
    };
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

  function triggerFeedback(text, type = "info", duration = 2600) {
    if (!text) return;
    const id = Date.now() + Math.random();
    setFeedbackOverlay({ id, text, type });
    window.setTimeout(() => {
      setFeedbackOverlay((current) => current?.id === id ? null : current);
    }, duration);
  }

  function triggerBoardFx(className, duration = 1600, text = "") {
    setDevFxClass(className || "");
    if (text) triggerFeedback(text, className || "fx", duration);
    window.setTimeout(() => {
      setDevFxClass((current) => current === className ? "" : current);
    }, duration);
  }

  function spawnFxItem(type, payload = {}, duration = 2600) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const item = { id, type, ...payload };
    setDevFxItems((current) => [...current, item].slice(-24));
    window.setTimeout(() => {
      setDevFxItems((current) => current.filter((candidate) => candidate.id !== id));
    }, duration);
    return id;
  }

  function clearFxItems() {
    setDevFxItems([]);
    setDevFxClass("");
    setFeedbackOverlay(null);
    setDevVisuals((current) => ({
      ...current,
      fakeTraps: [],
      fakeSmoke: [],
      pings: [],
      spotlight: null,
      lasers: []
    }));
  }

  function triggerDevFx(args, options = {}) {
    const forcedBy = options.forcedBy;
    const sub = String(args[0] || "").toLowerCase();
    if (sub === "clear") {
      clearFxItems();
      if (forcedBy) triggerFeedback(`${forcedBy} cleared your visual effects.`, "fx");
      else appendDevLines("visual effects cleared.");
      return;
    }

    const boardEffect = sub === "board" ? String(args[1] || "").toLowerCase() : sub;
    const boardClassMap = {
      earthquake: "fx-earthquake",
      flashboard: "fx-flash",
      flash: "fx-flash",
      invertboard: "fx-invert",
      invert: "fx-invert",
      drunkboard: "fx-drunk",
      drunk: "fx-drunk",
      disco: "fx-disco",
      bloodmoon: "fx-bloodmoon",
      night: "fx-night",
      nightmode: "fx-night",
      fog: "fx-fog",
      snow: "fx-snow",
      rainbow: "fx-rainbow",
      rainbowboard: "fx-rainbow",
      tilt: "fx-tilt",
      tiltboard: "fx-tilt",
      squish: "fx-squish",
      squishboard: "fx-squish",
      lava: "fx-theme-lava",
      ice: "fx-theme-ice",
      graveyard: "fx-theme-graveyard",
      scooby: "fx-theme-scooby",
      nuke: "fx-theme-nuke",
      gold: "fx-theme-gold",
      void: "fx-theme-void"
    };

    const boardClass = boardClassMap[boardEffect] || "";
    if (boardClass) triggerBoardFx(boardClass, 3600, formatFxMessage(args));

    if (sub === "confetti") {
      spawnFxItem("confetti", {}, 3400);
      playUiSound("income");
    } else if (sub === "fireworks") {
      spawnFxItem("fireworks", {}, 3600);
      playUiSound("explosion");
    } else if (sub === "emoji") {
      spawnFxItem("emoji", { icon: args[1] || "✨" }, 2600);
      playUiSound("ping");
    } else if (sub === "rain") {
      spawnFxItem("rain", { icon: normaliseRainIcon(args.slice(1).join(" ")) }, 5200);
      playUiSound("ping");
    } else if (sub === "freeze") {
      spawnFxItem("freeze", {}, 2200);
      triggerBoardFx("fx-freeze", 2200, "Frozen.");
      playUiSound("timer");
    } else if (sub === "fakecheck") {
      spawnFxItem("warning", { text: "CHECK?" }, 1900);
      playUiSound("check");
    } else if (sub === "fakewin") {
      spawnFxItem("victory", { text: `${args[1] || "Someone"} wins!` }, 2600);
      playUiSound("gameOver");
    } else if (sub === "pause") {
      spawnFxItem("countdown", { text: "Dramatic pause..." }, 2600);
      playUiSound("timer");
    } else if (sub === "bonk") {
      spawnFxItem("bonk", { target: args[1] || "" }, 2000);
      playUiSound("illegal");
    } else if (sub === "jumpscare") {
      spawnFxItem("jumpscare", { target: args[1] || "all" }, 1500);
      playUiSound("shout");
    } else if (sub === "toasty") {
      spawnFxItem("toasty", {}, 3200);
      playUiSound("chat");
    } else if (sub === "laser") {
      const from = parseDevLocation(args, 1);
      const to = from ? parseDevLocation(args, from.nextIndex) : null;
      if (from && to) {
        setDevVisuals((current) => ({
          ...current,
          lasers: [...(current.lasers || []), { from: from.location, to: to.location, id: Date.now() }].slice(-6),
          highlights: [...(current.highlights || []), from.location, to.location].slice(-64)
        }));
        spawnFxItem("laser", { from: coordText(from.location), to: coordText(to.location) }, 1800);
      } else {
        spawnFxItem("laser", { from: "A", to: "B" }, 1800);
      }
      playUiSound("explosion");
    } else if (sub === "scooby") {
      const mode = String(args[1] || "zoinks").toLowerCase();
      const parsed = parseDevLocation(args, 2);
      const loc = parsed?.location;
      if (mode === "mysterymachine") {
        spawnFxItem("mysterymachine", {}, 4200);
      } else if (mode === "traproulette") {
        const traps = Array.from({ length: 10 }, (_, index) => ({ x: Math.floor(Math.random() * 8), y: 0, z: Math.floor(Math.random() * 8), id: Date.now() + index }));
        setDevVisuals((current) => ({ ...current, fakeTraps: [...(current.fakeTraps || []), ...traps].slice(-24) }));
        spawnFxItem("scoobyText", { text: "Trap roulette!" }, 2600);
      } else if (mode === "ghosttrap" && loc) {
        setDevVisuals((current) => ({ ...current, fakeTraps: [...(current.fakeTraps || []), { ...loc, id: Date.now() }].slice(-16) }));
        spawnFxItem("scoobyText", { text: "Ghost trap clue!" }, 2400);
      } else if (mode === "smoke" && loc) {
        setDevVisuals((current) => ({ ...current, fakeSmoke: [...(current.fakeSmoke || []), { ...loc, id: Date.now() }].slice(-16) }));
        spawnFxItem("scoobyText", { text: "Fake smoke!" }, 2400);
      } else if (["jinkies", "footprints", "haunt", "boo", "magnify"].includes(mode) && loc) {
        setDevVisuals((current) => ({
          ...current,
          pings: [...(current.pings || []), { ...loc, id: Date.now(), scooby: true, mode }].slice(-10),
          spotlight: mode === "magnify" ? loc : current.spotlight
        }));
        spawnFxItem(mode === "haunt" || mode === "boo" ? "ghost" : "scoobyText", { text: `${mode}!` }, 2300);
      } else if (mode === "owners") {
        spawnFxItem("scoobyText", { text: "Trap owners flashed." }, 2200);
      } else if (mode === "panicpawns") {
        triggerBoardFx("fx-drunk", 1800, "Pawns panic!");
        spawnFxItem("scoobyText", { text: "Panic pawns!" }, 2200);
      } else {
        spawnFxItem("scoobyText", { text: mode === "zoinks" ? "ZOINKS!" : mode.toUpperCase() }, 2300);
      }
      playUiSound("trap");
    } else if (sub === "board" && String(args[1] || "").toLowerCase() === "theme") {
      const theme = String(args[2] || "lava").toLowerCase();
      triggerBoardFx(boardClassMap[theme] || "fx-theme-lava", 4200, `Theme: ${theme}`);
    } else if (boardClass) {
      playUiSound(sub === "earthquake" ? "explosion" : "ping");
    } else {
      spawnFxItem("generic", { text: formatFxMessage(args) }, 2400);
      playUiSound("ping");
    }

    if (forcedBy) triggerFeedback(`${forcedBy} forced FX: ${args.join(" ") || "effect"}`, "fx");
    else appendDevLines(`fx: ${args.join(" ") || "effect"}`);
  }

  useEffect(() => {
    localStorage.setItem("soundEnabled", String(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    localStorage.setItem("censorContent", String(censorContent));
  }, [censorContent]);

  useEffect(() => {
    localStorage.setItem("homePanel", homePanel);
  }, [homePanel]);

  useEffect(() => {
    const suffix = game ? `${getVariantLabel(game.variant)} · ${game.roomCode || "Game"}` : "Home";
    document.title = `The Chess Lab - ${suffix}`;
  }, [game]);

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
        const atomicCount = lastMove?.atomicRemoved?.length || 0;
        const trap = lastMove?.scoobyTrap;
        if (atomicCount || lastMove?.tycoonExplosion || lastMove?.nukeExplosion) {
          playUiSound("explosion");
          triggerBoardFx("fx-earthquake", 900, atomicCount ? `Atomic blast: ${atomicCount} piece${atomicCount === 1 ? "" : "s"} removed.` : "Explosion resolved.");
        } else if (trap) {
          playUiSound("trap");
          triggerFeedback(`Scooby trap triggered: ${trap.type || "trap"}.`, "trap");
        } else {
          playUiSound(lastMove?.captured ? "capture" : "move");
        }
      }

      const incomeEffects = game.effects?.income || [];
      const previousIncomeKey = (previousGame.effects?.income || []).map((item) => `${item.color}:${item.amount}:${item.time}`).join("|");
      const nextIncomeKey = incomeEffects.map((item) => `${item.color}:${item.amount}:${item.time}`).join("|");
      if (incomeEffects.length && nextIncomeKey !== previousIncomeKey) {
        const latestIncome = incomeEffects[incomeEffects.length - 1];
        playUiSound("income");
        triggerFeedback(`${latestIncome.color} earned +$${latestIncome.amount} from Tycoon production.`, "income");
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
      appendDevLines(getDevCommandHelp(args));
      return;
    }

    if (command.action === "clear") {
      setDevConsoleLines([]);
      return;
    }

    const routedArgs = applyCommandPrefix(command, args);

    if (handleLocalDevCommand(command.action, routedArgs)) {
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
      args: routedArgs,
      name: name.trim() || "Developer",
      currentRoomCode: roomCode,
      selectedVariant,
      selectedTimeControl,
      selectedAIDifficulty
    });
  }



  function triggerDevCosmetic(args, options = {}) {
    const forcedBy = options.forcedBy;
    const sub = String(args[0] || "").toLowerCase();
    if (sub === "clear") {
      setDevCosmetics({ pieces: {}, icons: {}, curses: {}, players: {} });
      if (forcedBy) triggerFeedback(`${forcedBy} cleared your cosmetics.`, "cosmetic");
      return;
    }

    if (sub === "piece") {
      const parsed = parseDevLocation(args, 1);
      if (!parsed) {
        if (forcedBy) triggerFeedback(`${forcedBy} tried an invalid cosmetic command.`, "cosmetic");
        return;
      }
      const key = coordText(parsed.location);
      const effect = String(args[parsed.nextIndex] || "glow").toLowerCase();
      const rest = args.slice(parsed.nextIndex + 1);
      setDevCosmetics((current) => {
        const pieces = { ...(current.pieces || {}) };
        const existing = { ...(pieces[key] || {}) };

        if (effect === "clear" || effect === "remove") {
          delete pieces[key];
        } else if (effect === "size") {
          existing.size = ["tiny", "small"].includes(String(rest[0] || "").toLowerCase()) ? "tiny" : "big";
          pieces[key] = existing;
        } else if (["big", "giant"].includes(effect)) {
          existing.size = "big";
          pieces[key] = existing;
        } else if (["tiny", "small"].includes(effect)) {
          existing.size = "tiny";
          pieces[key] = existing;
        } else if (effect === "spin") {
          existing.spin = true;
          pieces[key] = existing;
        } else if (effect === "jiggle") {
          existing.jiggle = true;
          pieces[key] = existing;
        } else if (effect === "glow") {
          existing.glow = rest[0] || "gold";
          pieces[key] = existing;
        } else if (effect === "hat") {
          existing.hat = rest.join(" ") || "♕";
          pieces[key] = existing;
        } else if (effect === "mustache" || effect === "moustache") {
          existing.mustache = true;
          pieces[key] = existing;
        } else if (effect === "name" || effect === "rename") {
          existing.name = rest.join(" ") || "Gary";
          pieces[key] = existing;
        } else if (effect === "clown") {
          existing.clown = true;
          pieces[key] = existing;
        } else if (effect === "ghost") {
          existing.ghost = true;
          pieces[key] = existing;
        } else {
          existing.glow = effect;
          pieces[key] = existing;
        }

        return { ...current, pieces };
      });
      if (forcedBy) triggerFeedback(`${forcedBy} changed piece ${key}: ${effect}`, "cosmetic");
      return;
    }

    if (sub === "curse") {
      const target = String(args[1] || "").toLowerCase();
      const curse = String(args[2] || "clear").toLowerCase();
      if (!target) return;
      setDevCosmetics((current) => {
        const curses = { ...(current.curses || {}) };
        if (curse === "clear" || curse === "off" || curse === "remove") delete curses[target];
        else curses[target] = curse;
        return { ...current, curses };
      });
      if (forcedBy) triggerFeedback(`${forcedBy} ${curse === "clear" ? "cleared a curse" : `cursed ${target}: ${curse}`}`, "cosmetic");
      return;
    }

    if (sub === "icon") {
      const [colour, piece, icon] = args.slice(1);
      if (!colour || !piece || !icon) return;
      setDevCosmetics((current) => ({ ...current, icons: { ...(current.icons || {}), [`${colour}:${piece}`]: icon } }));
      if (forcedBy) triggerFeedback(`${forcedBy} changed ${colour} ${piece} icon.`, "cosmetic");
      return;
    }

    if (sub === "player") {
      const target = String(args[1] || "").toLowerCase();
      const effect = String(args[2] || "").toLowerCase();
      if (!target || !effect) return;
      setDevCosmetics((current) => {
        const players = { ...(current.players || {}) };
        const existing = { ...(players[target] || {}) };
        if (effect === "clear" || effect === "off" || effect === "remove") {
          delete players[target];
        } else if (effect === "duckify") {
          existing.duckify = true;
          existing.scoobydoo = false;
          players[target] = existing;
        } else if (effect === "scoobydoo") {
          existing.scoobydoo = true;
          existing.duckify = false;
          players[target] = existing;
        } else {
          existing[effect] = true;
          players[target] = existing;
        }
        return { ...current, players };
      });
      if (forcedBy) triggerFeedback(`${forcedBy} forced ${target} ${effect}.`, "cosmetic");
    }
  }

  function handleLocalDevCommand(action, args) {
    if (action === "fx" && ["force", "send", "push"].includes(String(args[0] || "").toLowerCase())) {
      const target = args[1] || "room";
      const fxArgs = args.slice(2);
      if (!fxArgs.length) {
        appendDevLines("! usage: fx force [target] [effect args...]");
        return true;
      }
      socket.emit("devCommand", {
        action: "forceFx",
        args: [target, ...fxArgs],
        name: name.trim() || "Developer",
        currentRoomCode: roomCode,
        selectedVariant,
        selectedTimeControl,
        selectedAIDifficulty
      });
      return true;
    }

    if (action === "cosmetic" && ["force", "send", "push"].includes(String(args[0] || "").toLowerCase())) {
      const target = args[1] || "room";
      const cosmeticArgs = args.slice(2);
      if (!cosmeticArgs.length) {
        appendDevLines("! usage: cosmetic force [target] [cosmetic args...]");
        return true;
      }
      socket.emit("devCommand", {
        action: "forceCosmetic",
        args: [target, ...cosmeticArgs],
        name: name.trim() || "Developer",
        currentRoomCode: roomCode,
        selectedVariant,
        selectedTimeControl,
        selectedAIDifficulty
      });
      return true;
    }

    if (action === "room" && args[0] === "copy") {
      copyRoomCode();
      appendDevLines(roomCode ? `copied ${roomCode}` : "! no active room code");
      return true;
    }

    if (action === "room" && args[0] === "exit") {
      socket.emit("devCommand", {
        action,
        args,
        name: name.trim() || "Developer",
        currentRoomCode: roomCode,
        selectedVariant,
        selectedTimeControl,
        selectedAIDifficulty
      });
      returnHome();
      return true;
    }

    if (action === "view") {
      const sub = String(args[0] || "").toLowerCase();
      if (sub === "mode") {
        const nextView = String(args[1] || "").trim().toUpperCase();
        if (!["XZ", "XY", "YZ", "ISO"].includes(nextView)) { appendDevLines("! usage: view mode [xz | xy | yz | iso]"); return true; }
        setView(nextView);
        appendDevLines(`view=${nextView}`);
        return true;
      }
      if (sub === "layer") {
        const nextLayer = Number.parseInt(args[1], 10);
        if (!Number.isInteger(nextLayer) || nextLayer < 0 || nextLayer > 7) { appendDevLines("! usage: view layer [0-7]"); return true; }
        setLayer(nextLayer);
        appendDevLines(`layer=${nextLayer}`);
        return true;
      }
      if (sub === "coords") {
        const mode = String(args[1] || "toggle").toLowerCase();
        setDevVisuals((current) => ({ ...current, showCoords: mode === "on" ? true : mode === "off" ? false : !current.showCoords }));
        appendDevLines("coordinate labels updated.");
        return true;
      }
    }

    if (action === "mark") {
      const sub = String(args[0] || "").toLowerCase();
      if (sub === "clear") {
        setDevVisuals((current) => ({ ...current, highlights: [], ghostMove: null, spotlight: null, pings: [] }));
        appendDevLines("dev markers cleared.");
        return true;
      }
      if (sub === "square" || sub === "spotlight" || sub === "ping") {
        const loc = parseDevLocation(args, 1)?.location;
        if (!loc) { appendDevLines(`! usage: mark ${sub} [location]`); return true; }
        setDevVisuals((current) => ({
          ...current,
          highlights: sub === "square" ? [...(current.highlights || []), loc].slice(-64) : current.highlights,
          spotlight: sub === "spotlight" ? loc : current.spotlight,
          pings: sub === "ping" ? [...(current.pings || []), { ...loc, id: Date.now() }].slice(-8) : current.pings
        }));
        triggerFeedback(sub === "ping" ? `Ping ${coordText(loc)}` : `Spotlight ${coordText(loc)}`, sub);
        playUiSound("ping");
        return true;
      }
      if (sub === "ghost") {
        if (String(args[1] || "").toLowerCase() === "clear") {
          setDevVisuals((current) => ({ ...current, ghostMove: null }));
          appendDevLines("ghost move cleared.");
          return true;
        }
        const from = parseDevLocation(args, 1);
        const to = from ? parseDevLocation(args, from.nextIndex) : null;
        if (!from || !to) { appendDevLines("! usage: mark ghost [from] [to|clear]"); return true; }
        setDevVisuals((current) => ({ ...current, ghostMove: { from: from.location, to: to.location } }));
        appendDevLines(`ghost move ${coordText(from.location)} → ${coordText(to.location)}.`);
        return true;
      }
      if (sub === "checks") {
        const kings = (game?.pieces || []).filter((piece) => piece.type === "king").map(({x,y,z}) => ({x,y,z}));
        setDevVisuals((current) => ({ ...current, highlights: kings }));
        appendDevLines(`highlighted ${kings.length} king square(s).`);
        return true;
      }
      if (sub === "attacks") {
        const side = String(args[1] || game?.turn || "").toLowerCase();
        const highlights = (game?.pieces || []).filter((piece) => !side || piece.color === side).map(({x,y,z}) => ({x,y,z}));
        setDevVisuals((current) => ({ ...current, highlights }));
        appendDevLines(`debug-highlighted ${highlights.length} ${side || "all"} piece origin square(s).`);
        return true;
      }
    }

    if (action === "fx") {
      triggerDevFx(args);
      return true;
    }

    if (action === "cosmetic") {
      triggerDevCosmetic(args);
      appendDevLines(`cosmetic: ${args.join(" ") || "effect"}`);
      return true;
    }

    if (action === "predict" && args[0] === "ghost") {
      const side = String(args[1] || color || "white").toLowerCase();
      const pending = game?.predict?.pending?.[side];
      if (pending?.to && pending?.pieceId) {
        const piece = game.pieces.find((candidate) => candidate.id === pending.pieceId);
        if (piece) {
          setDevVisuals((current) => ({ ...current, ghostMove: { from: { x: piece.x, y: piece.y, z: piece.z }, to: pending.to } }));
          appendDevLines(`predict ghost shown for ${side}.`);
        } else appendDevLines("! pending piece no longer exists.");
      } else appendDevLines(`! no visible pending move for ${side}.`);
      return true;
    }

    return false;
  }

  function formatFxMessage(args) {
    const sub = String(args[0] || "effect").toLowerCase();
    if (sub === "board") return `Board FX: ${args.slice(1).join(" ") || "effect"}`;
    if (sub === "scooby") return `Scooby FX: ${args.slice(1).join(" ") || "zoinks"}`;
    if (sub === "emoji") return args[1] || "✨";
    if (sub === "fakecheck") return "CHECK?";
    if (sub === "fakewin") return `${args[1] || "Someone"} wins! (fake)`;
    if (sub === "pause") return "Dramatic pause...";
    return sub.toUpperCase();
  }

  function updateAccountForm(field, value) {
    setAccountForm((current) => ({ ...current, [field]: value }));
  }

  function updateAccountEditForm(field, value) {
    setAccountEditForm((current) => ({ ...current, [field]: value }));
  }

  function submitAccountUpdate(updates) {
    if (!accountToken) {
      setAccountMessage(UI_TEXT.account.sessionExpired);
      return;
    }
    socket.emit("accountUpdate", { token: accountToken, updates });
  }

  function submitProfileUpdate(event) {
    event?.preventDefault?.();
    submitAccountUpdate({ username: accountEditForm.username, profileIcon: accountEditForm.profileIcon });
  }

  function submitEmailUpdate(event) {
    event?.preventDefault?.();
    submitAccountUpdate({ email: accountEditForm.email, currentPassword: accountEditForm.currentPassword });
  }

  function submitPasswordUpdate(event) {
    event?.preventDefault?.();
    submitAccountUpdate({ currentPassword: accountEditForm.currentPassword, newPassword: accountEditForm.newPassword });
  }

  function submitAccountLogin(event) {
    event?.preventDefault?.();
    socket.emit("accountLogin", { login: accountForm.login, password: accountForm.password });
  }

  function submitAccountCreate(event) {
    event?.preventDefault?.();
    socket.emit("accountCreate", { email: accountForm.email, username: accountForm.username, password: accountForm.password });
  }

  function logoutAccount() {
    socket.emit("accountLogout", { token: accountToken });
  }

  function saveName() {
    const clean = account?.username || name.trim() || "Player";
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
    const nextGameMode = override.gameMode || selectedGameMode;
    const nextDifficulty = override.aiDifficulty || selectedAIDifficulty;
    if (nextGameMode === "ai" && aiAvailability[nextDifficulty] === false) {
      setNotice(`${getAIDifficultyLabel(nextDifficulty)} AI is currently disabled by the server.`);
      playUiSound("illegal");
      return;
    }
    socket.emit("createRoom", {
      name: saveName(),
      variant: override.variant || selectedVariant,
      timeControl: override.timeControl || selectedTimeControl,
      gameMode: nextGameMode,
      aiDifficulty: nextDifficulty
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
    setQueueStartedAt(Date.now());
    setNotice(matchmakingScope === "any" ? "Searching all open lab queues..." : "Searching selected experiment queue...");
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
    setQueueStartedAt(null);
    setNotice("Cancelling Open Lab Queue search...");
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
    if (game?.visibility === "public" || game?.matchmakingScope) {
      setSelectedVariant(nextVariant);
      setSelectedTimeControl(nextTimeControl);
      setSelectedGameMode("online");
      setHomePanel("online");
      setGame(null);
      const cleanName = saveName();
      setMatchmakingSearching(true);
      setQueueStartedAt(Date.now());
      socket.emit("quickMatch", { name: cleanName, variant: nextVariant, timeControl: nextTimeControl, scope: matchmakingScope });
      return;
    }
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

  function submitAppeal() {
    const punishment = punishmentNotice?.punishments?.[0];
    if (!punishment || !appealText.trim()) return;
    socket.emit("punishmentAppeal", { punishmentId: punishment.id, text: appealText.trim() });
  }

  function sendFriendRequestFromDrawer() {
    if (!friendTarget.trim() || !accountToken) return;
    socket.emit("friendRequest", { token: accountToken, target: friendTarget.trim() });
    setFriendTarget("");
  }

  function respondFriendRequestFromDrawer(requestId, accept) {
    socket.emit("friendRespond", { token: accountToken, requestId, accept });
  }

  function sendFriendMessageFromWindow() {
    if (!friendChatTarget || !friendMessageDraft.trim()) return;
    socket.emit("friendMessage", { token: accountToken, toAccountId: friendChatTarget.accountId, body: friendMessageDraft.trim() });
    setFriendMessageDraft("");
  }

  function sendFriendChallenge(friend) {
    socket.emit("friendChallenge", { token: accountToken, target: friend.username || friend.accountId, variant: selectedVariant, timeControl: selectedTimeControl });
  }

  function respondToChallenge(accept) {
    if (!challengeNotice) return;
    socket.emit("friendChallengeRespond", { token: accountToken, challengeId: challengeNotice.id, accept, name: saveName() });
    setChallengeNotice(null);
  }

  function requestPublicProfile(query) {
    socket.emit("requestPublicProfile", { query });
  }

  function requestRematch() {
    if (!roomCode) return;
    socket.emit("requestRematch", { roomCode });
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

  const screenText = (value) => censorContent ? censorText(value) : String(value ?? "");

  if (!game) {
    const queueElapsed = queueStartedAt ? Math.max(0, Math.floor((clockTick - queueStartedAt) / 1000)) : 0;
    return (
      <main className="app lobby lab-lobby">
        <div className="lobby-chess-bg" aria-hidden="true" />
        <SettingsButton
          open={settingsOpen}
          onToggle={() => setSettingsOpen((value) => !value)}
          soundEnabled={soundEnabled}
          soundVolume={soundVolume}
          censorContent={censorContent}
          account={account}
          accountMode={accountMode}
          accountForm={accountForm}
          accountMessage={accountMessage}
          onAccountMode={setAccountMode}
          onAccountForm={updateAccountForm}
          onAccountLogin={submitAccountLogin}
          onAccountCreate={submitAccountCreate}
          onAccountLogout={logoutAccount}
          onAccountOpen={() => setAccountModalOpen(true)}
          onSoundToggle={() => { unlockAudio(); setSoundEnabled((value) => !value); }}
          onVolume={(value) => { unlockAudio(); setSoundVolume(value); }}
          onCensorToggle={() => setCensorContent((value) => !value)}
        />
        <AccountModal
          open={accountModalOpen}
          account={account}
          accountMode={accountMode}
          accountForm={accountForm}
          accountEditForm={accountEditForm}
          accountMessage={accountMessage}
          profileIcons={profileIcons}
          selectedVariant={selectedVariant}
          onClose={() => setAccountModalOpen(false)}
          onAccountMode={setAccountMode}
          onAccountForm={updateAccountForm}
          onAccountEditForm={updateAccountEditForm}
          onAccountLogin={submitAccountLogin}
          onAccountCreate={submitAccountCreate}
          onProfileUpdate={submitProfileUpdate}
          onEmailUpdate={submitEmailUpdate}
          onPasswordUpdate={submitPasswordUpdate}
          onAccountLogout={logoutAccount}
        />

        <section className="lab-hero" aria-label="The Chess Lab home">
          <h1 className="lab-title" aria-label="The Chess Lab">
            <span>The</span>
            <span>Chess</span>
            <span>Lab</span>
            <i aria-hidden="true" />
          </h1>
          <p>Experimental chess variants, playable instantly.</p>
        </section>

        <section className="lab-home-card">
          {homeChooser === "variant" ? (
            <ChoiceGallery
              title="Choose an experiment"
              subtitle="Pick the rules you want to test. Hover or tap a card for the lab notes."
              items={VARIANT_OPTIONS}
              selectedId={selectedVariant}
              getDescription={(id) => UI_TEXT.variants[id]?.subtitle || "A Chess Lab experiment."}
              getMeta={(id) => getVariantCategory(id)}
              onSelect={(id) => { setSelectedVariant(id); setHomeChooser(null); }}
              onBack={() => setHomeChooser(null)}
            />
          ) : homeChooser === "time" ? (
            <ChoiceGallery
              title="Choose time control"
              subtitle="Select the pace for the lab room."
              items={TIME_CONTROL_OPTIONS}
              selectedId={selectedTimeControl}
              getDescription={(id) => getTimeControlDescription(id)}
              getMeta={(id) => `${TIME_CONTROL_OPTIONS.find((control) => control.id === id)?.seconds || 0}s each`}
              onSelect={(id) => { setSelectedTimeControl(id); setHomeChooser(null); }}
              onBack={() => setHomeChooser(null)}
            />
          ) : matchmakingSearching ? (
            <QueueSearchPanel
              variant={getVariantLabel(selectedVariant)}
              timeControl={getTimeControlLabel(selectedTimeControl)}
              scope={matchmakingScope}
              elapsed={queueElapsed}
              onCancel={cancelQuickMatch}
            />
          ) : (
            <>
              <div className="lab-user-row polished-account-row">
                {account ? (
                  <button className="home-profile-card" type="button" onClick={() => setAccountModalOpen(true)}>
                    <ProfileAvatar account={account} size="large" />
                    <div>
                      <span className="eyebrow">{UI_TEXT.account.accountBadge}</span>
                      <h2>{account.username}</h2>
                      <p>{formatModeStats(account, selectedVariant)} · {UI_TEXT.account.memberSince} {formatDateShort(account.createdAt)}</p>
                    </div>
                  </button>
                ) : (
                  <div className="guest-home-strip">
                    <button className="guest-profile-chip" type="button" onClick={() => setAccountModalOpen(true)} title={UI_TEXT.account.signedOutBody}>
                      <GuestAvatar size="large" />
                      <span>
                        <span className="eyebrow">{UI_TEXT.account.guestBadge}</span>
                        <strong>{UI_TEXT.lobby.playAsGuestTitle}</strong>
                      </span>
                    </button>
                    <label className="lab-name-input guest-name-input">
                      <span>{UI_TEXT.lobby.displayNameLabel}</span>
                      <input value={name} onChange={(event) => setName(event.target.value)} placeholder={UI_TEXT.lobby.displayNamePlaceholder} />
                    </label>

                  </div>
                )}
              </div>

              <div className="lab-selection-row">
                <button className="lab-big-select experiment-select" type="button" onClick={() => setHomeChooser("variant")}>
                  <span>Experiment</span>
                  <strong>{getVariantLabel(selectedVariant)}</strong>
                  <small>{UI_TEXT.variants[selectedVariant]?.subtitle}</small>
                </button>
                <button className="lab-big-select time-select" type="button" onClick={() => setHomeChooser("time")}>
                  <span>Time control</span>
                  <strong>{getTimeControlLabel(selectedTimeControl)}</strong>
                  <small>{getTimeControlDescription(selectedTimeControl)}</small>
                </button>
              </div>

              <div className="lab-mode-tabs-row">
                <div className="lab-mode-tabs" role="tablist" aria-label="Play mode">
                  {[
                    ["online", UI_TEXT.gameModes.online],
                    ["ai", UI_TEXT.gameModes.ai],
                    ["private", UI_TEXT.lobby.privateModeLabel || "Host / Join Private"]
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      className={homePanel === id ? "active" : ""}
                      type="button"
                      onClick={() => { setHomePanel(id); setSelectedGameMode(id === "ai" ? "ai" : "online"); }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  className={`leaderboard-side-button ${homePanel === "leaderboard" ? "active" : ""}`}
                  type="button"
                  onClick={() => setHomePanel("leaderboard")}
                >
                  <span>♕</span>
                  <strong>{UI_TEXT.leaderboard.title}</strong>
                </button>
              </div>

              <div className="lab-mode-panel">
                {homePanel === "online" && (
                  <div className="mode-panel-inner online-panel">
                    <div>
                      <h3>Open Lab Queue</h3>
                      <p>Queue for the selected experiment. A public room is created invisibly while you wait; private rooms are never pulled into matchmaking.</p>
                    </div>
                    <label className="queue-scope-select polished-select">
                      <span>Queue scope</span>
                      <select value={matchmakingScope} onChange={(event) => setMatchmakingScope(event.target.value)}>
                        <option value="selected">Selected experiment + time</option>
                        <option value="any">Any public experiment</option>
                      </select>
                    </label>
                    <button className="primary main-action-button lab-action" onClick={quickMatch}>Find Match</button>
                  </div>
                )}

                {homePanel === "ai" && (
                  <div className="mode-panel-inner ai-panel">
                    <div>
                      <h3>Bot Test</h3>
                      <p>Start a private lab room against a bot. Disabled difficulties are crossed out when server load needs protecting.</p>
                    </div>
                    <div className="ai-card-grid">
                      {AI_DIFFICULTY_OPTIONS.map((difficulty) => {
                        const disabled = aiAvailability[difficulty.id] === false;
                        return (
                          <button
                            key={difficulty.id}
                            className={`${selectedAIDifficulty === difficulty.id ? "active" : ""} ${disabled ? "ai-disabled" : ""}`}
                            type="button"
                            disabled={disabled}
                            onClick={() => !disabled && setSelectedAIDifficulty(difficulty.id)}
                          >
                            <strong>{difficulty.label}</strong>
                            <span>{getAIDifficultyDescription(difficulty.id)}</span>
                          </button>
                        );
                      })}
                    </div>
                    <button className="primary main-action-button lab-action" onClick={() => createRoom({ gameMode: "ai" })}>Start Bot Test</button>
                  </div>
                )}

                {homePanel === "private" && (
                  <div className="mode-panel-inner private-panel">
                    <div>
                      <h3>Private Lab Room</h3>
                      <p>Host a code-only room or join a friend directly. These rooms stay out of the public queue.</p>
                    </div>
                    <button className="primary main-action-button lab-action" onClick={() => createRoom({ gameMode: "online" })}>Host Private</button>
                    <div className="join-row compact-join-row lab-join-row">
                      <input
                        value={roomInput}
                        onChange={(event) => setRoomInput(event.target.value.toUpperCase())}
                        placeholder="Lab Code"
                        maxLength={6}
                      />
                      <button onClick={joinRoom}>Join Lab Room</button>
                    </div>
                  </div>
                )}

                {homePanel === "leaderboard" && (
                  <LeaderboardPanel
                    data={leaderboard}
                    variant={selectedVariant}
                    scope={leaderboardScope}
                    onScope={setLeaderboardScope}
                    onRefresh={() => socket.emit("requestLeaderboard", { variant: selectedVariant, scope: leaderboardScope })}
                    onProfile={requestPublicProfile}
                  />
                )}
              </div>
            </>
          )}

          <div className="lobby-footer-row lab-footer-row">
            <p className="notice">{notice}</p>
            <p className="subtle">Public Beta · Experiments may change while the lab is live.</p>
          </div>
        </section>
        {shoutOverlay && <ShoutOverlay message={screenText(shoutOverlay.message)} from={screenText(shoutOverlay.from)} />}
        {feedbackOverlay && <FeedbackOverlay text={screenText(feedbackOverlay.text)} type={feedbackOverlay.type} />}
        <DevFxLayer items={devFxItems} />
        <FriendsDrawer
          open={socialOpen}
          account={account}
          socialState={socialState}
          friendTarget={friendTarget}
          onToggle={() => setSocialOpen((value) => !value)}
          onTarget={setFriendTarget}
          onSendRequest={sendFriendRequestFromDrawer}
          onRespondRequest={respondFriendRequestFromDrawer}
          onProfile={requestPublicProfile}
          onMessage={setFriendChatTarget}
          onChallenge={sendFriendChallenge}
        />
        <FriendMessageWindow
          friend={friendChatTarget}
          messages={socialState?.messages || []}
          draft={friendMessageDraft}
          onDraft={setFriendMessageDraft}
          onSend={sendFriendMessageFromWindow}
          onClose={() => setFriendChatTarget(null)}
        />
        <ChallengeNotice challenge={challengeNotice} onAccept={() => respondToChallenge(true)} onDeny={() => respondToChallenge(false)} />
        <PunishmentNoticeModal notice={punishmentNotice} appealText={appealText} onAppealText={setAppealText} onSubmit={submitAppeal} onClose={() => setPunishmentNotice(null)} />
        <PublicProfileModal profile={publicProfile} onClose={() => setPublicProfile(null)} />
      <ReportCaseModal reportCase={reportCase} onClose={() => setReportCase(null)} />
        <ReportCaseModal reportCase={reportCase} onClose={() => setReportCase(null)} />
        <MatchFoundOverlay match={matchFoundOverlay} />
        <NetworkDashboardModal
          open={Boolean(networkDashboard)}
          config={networkDashboard}
          metrics={networkMetrics}
          onClose={() => { setNetworkDashboard(null); setNetworkMetrics(null); }}
        />
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
    <main className={`app game-app ${devFxClass} ${devCosmetics.curses?.[color] ? `curse-${devCosmetics.curses[color]}` : ""}`}>
      <SettingsButton
        open={settingsOpen}
        onToggle={() => setSettingsOpen((value) => !value)}
        soundEnabled={soundEnabled}
        soundVolume={soundVolume}
        censorContent={censorContent}
        account={account}
        accountMode={accountMode}
        accountForm={accountForm}
        accountMessage={accountMessage}
        onAccountMode={setAccountMode}
        onAccountForm={updateAccountForm}
        onAccountLogin={submitAccountLogin}
        onAccountCreate={submitAccountCreate}
        onAccountLogout={logoutAccount}
        onAccountOpen={() => setAccountModalOpen(true)}
        onSoundToggle={() => { unlockAudio(); setSoundEnabled((value) => !value); }}
        onVolume={(value) => { unlockAudio(); setSoundVolume(value); }}
        onCensorToggle={() => setCensorContent((value) => !value)}
      />
      <AccountModal
        open={accountModalOpen}
        account={account}
        accountMode={accountMode}
        accountForm={accountForm}
        accountEditForm={accountEditForm}
        accountMessage={accountMessage}
        profileIcons={profileIcons}
        selectedVariant={game?.variant || selectedVariant}
        onClose={() => setAccountModalOpen(false)}
        onAccountMode={setAccountMode}
        onAccountForm={updateAccountForm}
        onAccountEditForm={updateAccountEditForm}
        onAccountLogin={submitAccountLogin}
        onAccountCreate={submitAccountCreate}
        onProfileUpdate={submitProfileUpdate}
        onEmailUpdate={submitEmailUpdate}
        onPasswordUpdate={submitPasswordUpdate}
        onAccountLogout={logoutAccount}
      />
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
          
        </div>
      </section>

      <section className="game-shell">
        <aside className="side-panel">
          <h2>{UI_TEXT.headings.players}</h2>
          <PlayerLine label={UI_TEXT.labels.white} player={game.players.white} active={!reviewMode && game.turn === "white"} formatText={screenText} />
          <PlayerLine label={UI_TEXT.labels.black} player={game.players.black} active={!reviewMode && game.turn === "black"} formatText={screenText} />
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
              formatText={screenText}
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
                devVisuals={{ ...devVisuals, cosmetics: devCosmetics }}
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
          color={color}
          onReturnHome={returnHome}
          onReplay={startNewRoom}
          onRematch={requestRematch}
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

      {shoutOverlay && <ShoutOverlay message={screenText(shoutOverlay.message)} from={screenText(shoutOverlay.from)} />}
      {feedbackOverlay && <FeedbackOverlay text={screenText(feedbackOverlay.text)} type={feedbackOverlay.type} />}
      <DevFxLayer items={devFxItems} />
      <FriendsDrawer
        open={socialOpen}
        account={account}
        socialState={socialState}
        friendTarget={friendTarget}
        onToggle={() => setSocialOpen((value) => !value)}
        onTarget={setFriendTarget}
        onSendRequest={sendFriendRequestFromDrawer}
        onRespondRequest={respondFriendRequestFromDrawer}
        onProfile={requestPublicProfile}
        onMessage={setFriendChatTarget}
        onChallenge={sendFriendChallenge}
      />
      <FriendMessageWindow friend={friendChatTarget} messages={socialState?.messages || []} draft={friendMessageDraft} onDraft={setFriendMessageDraft} onSend={sendFriendMessageFromWindow} onClose={() => setFriendChatTarget(null)} />
      <ChallengeNotice challenge={challengeNotice} onAccept={() => respondToChallenge(true)} onDeny={() => respondToChallenge(false)} />
      <PunishmentNoticeModal notice={punishmentNotice} appealText={appealText} onAppealText={setAppealText} onSubmit={submitAppeal} onClose={() => setPunishmentNotice(null)} />
      <PublicProfileModal profile={publicProfile} onClose={() => setPublicProfile(null)} />
      <ReportCaseModal reportCase={reportCase} onClose={() => setReportCase(null)} />
      <MatchFoundOverlay match={matchFoundOverlay} />
      <NetworkDashboardModal
        open={Boolean(networkDashboard)}
        config={networkDashboard}
        metrics={networkMetrics}
        onClose={() => { setNetworkDashboard(null); setNetworkMetrics(null); }}
      />

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


function FeedbackOverlay({ text, type }) {
  return (
    <div className={`feedback-overlay ${type || "info"}`} aria-live="polite">
      <strong>{text}</strong>
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

  if (game.variant === "predict") {
    for (const color of ["white", "black"]) {
      const pending = game.predict?.pending?.[color];
      if (!pending?.to) continue;
      const piece = (game.pieces || []).find((candidate) => candidate.id === pending.pieceId);
      if (piece) add(piece, "predict-from-highlight", "A", "predict-marker");
      add(pending.to, "predict-to-highlight", "→", "predict-marker");
    }
  }

  if (game.variant === "scooby") {
    const iconMap = { mine: "✹", pitfall: "◌", smoke: "☁", decoy: "◇", mindControl: "◈" };
    for (const trap of game.scooby?.traps || []) {
      const type = trap.displayType || trap.type;
      const isOwnTrap = Boolean(trap.viewerOwned);
      add(
        trap.pos,
        isOwnTrap ? "scooby-trap-own" : "scooby-trap-detected",
        iconMap[type] || "?",
        `scooby-trap-marker ${isOwnTrap ? "own" : "detected"}`
      );
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

