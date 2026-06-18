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
  const [game, setGame] = useState(null);
  const [view, setView] = useState("XZ");
  const [layer, setLayer] = useState(0);
  const [selectedPieceId, setSelectedPieceId] = useState(null);
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
  const devSequenceIndexRef = useRef(0);

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
    socket.on("invalidMove", (message) => setNotice(message));
    socket.on("chatError", (message) => setNotice(message || UI_TEXT.notices.chatFailed));
    socket.on("devCommandResult", (result = {}) => {
      if (result.unlocked) setDevConsoleUnlocked(true);
      const lines = result.lines || [result.ok ? "OK" : "Command failed."];
      if (lines.length) appendDevLines(lines.map((line) => result.ok === false ? `! ${line}` : String(line)));
    });

    socket.on("legalMoves", ({ pieceId, legalMoves: moves, reason }) => {
      if (reason) setNotice(reason);
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
      socket.off("invalidMove");
      socket.off("chatError");
      socket.off("devCommandResult");
      socket.off("legalMoves");
    };
  }, []);

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
    return clean;
  }

  function createRoom(override = {}) {
    socket.emit("createRoom", {
      name: saveName(),
      variant: override.variant || selectedVariant,
      timeControl: override.timeControl || selectedTimeControl,
      gameMode: override.gameMode || selectedGameMode,
      aiDifficulty: override.aiDifficulty || selectedAIDifficulty
    });
  }

  function joinRoom() {
    socket.emit("joinRoom", { roomCode: roomInput.trim().toUpperCase(), name: saveName() });
  }

  function returnHome() {
    setGame(null);
    setRoomCode("");
    setColor(null);
    setRole(null);
    setSelectedPieceId(null);
    setLegalMoves([]);
    setNotice("");
    setReviewMode(false);
    setReviewPlaying(false);
    setReviewIndex(0);
    setDismissedGameOver(false);
    setShowForfeitConfirm(false);
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

  function handleSquareClick(coord) {
    if (reviewMode || !game) return;
    if ((role === "spectator" || color === "spectator") && !hasDevMoveOverride) {
      setNotice(UI_TEXT.notices.spectatorNoMove);
      return;
    }
    const piece = game.pieces.find((candidate) => sameCoord(candidate, coord));

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
        <section className="gallery-title-wrap">
          <h1 className="gallery-title">{UI_TEXT.siteTitle}</h1>
        </section>
        <section className="lobby-card gallery-card">
          <label>
            {UI_TEXT.lobby.variantLabel}
            <select value={selectedVariant} onChange={(event) => setSelectedVariant(event.target.value)}>
              {VARIANT_OPTIONS.map((variant) => (
                <option key={variant.id} value={variant.id}>{variant.label}</option>
              ))}
            </select>
          </label>

          <p className="subtle variant-subtitle">{UI_TEXT.variants[selectedVariant]?.subtitle}</p>

          <div className="selection-block">
            <span className="selection-label">{UI_TEXT.lobby.gameModeLabel}</span>
            <div className="time-control-group mode-control-group" aria-label={UI_TEXT.lobby.gameModeLabel}>
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

          {selectedGameMode === "ai" && (
            <div className="selection-block">
              <span className="selection-label">{UI_TEXT.lobby.aiDifficultyLabel}</span>
              <div className="time-control-group ai-difficulty-group" aria-label={UI_TEXT.lobby.aiDifficultyLabel}>
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
          )}

          <div className="selection-block">
            <span className="selection-label">{UI_TEXT.lobby.timeControlLabel}</span>
            <div className="time-control-group" aria-label={UI_TEXT.lobby.timeControlLabel}>
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

          <label>
            {UI_TEXT.lobby.nameLabel}
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder={UI_TEXT.lobby.namePlaceholder} />
          </label>

          <button className="primary" onClick={() => createRoom()}>{selectedGameMode === "ai" ? UI_TEXT.lobby.hostAIButton : UI_TEXT.lobby.hostButton}</button>

          <div className="join-row">
            <input
              value={roomInput}
              onChange={(event) => setRoomInput(event.target.value.toUpperCase())}
              placeholder={UI_TEXT.lobby.roomPlaceholder}
              maxLength={6}
            />
            <button onClick={joinRoom}>{UI_TEXT.lobby.joinButton}</button>
          </div>

          <p className="notice">{notice}</p>
        </section>
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
              />
            )}
            {is3DVariant && <OrientationGizmo view={activeView} layer={activeLayer} isoAxes={isoGizmoAxes} />}
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
                  <strong>{move.pieceColor} {move.promotedTo ? "pawn" : move.pieceType}</strong>{" "}
                  ({move.from.x},{move.from.y},{move.from.z}) → ({move.to.x},{move.to.y},{move.to.z})
                  {move.captured ? ` × ${move.captured.type}` : ""}
                  {move.castle ? " castle" : ""}
                  {move.enPassant ? " en passant" : ""}
                  {move.promotedTo ? ` = ${move.promotedTo}` : ""}
                </li>
              ))}
            </ol>
          </div>

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
          step={guideStep}
          onStep={setGuideStep}
          onClose={() => setShowVariantGuide(false)}
        />
      )}

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


function VariantGuideModal({ step, onStep, onClose }) {
  const steps = [
    { title: "1. Choose a slice", body: "Pick XZ, XY, or YZ. Each button shows a different 2D board slice through the 3D cube.", art: "planes" },
    { title: "2. Scroll layers", body: "Use the scroll wheel to flick through the stacked layers like sheets of paper.", art: "layers" },
    { title: "3. Check ISO", body: "Use ISO when you need to see the whole cube and understand where pieces sit in 3D.", art: "iso" },
    { title: "4. Move in one plane", body: "Pieces move on one board plane at a time. A bishop can move diagonally across a slice, not through the cube.", art: "move" }
  ];
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

function TutorialArt({ art }) {
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

function GameChat({ chat, draft, onDraftChange, onSend, onForfeit, canForfeit }) {
  return (
    <section className="game-chat-panel" aria-label={UI_TEXT.headings.chat}>
      <div className="game-chat-header">
        <h2>{UI_TEXT.headings.chat}</h2>
        {canForfeit && <button className="danger-button forfeit-button" type="button" onClick={onForfeit}>{UI_TEXT.buttons.forfeit}</button>}
      </div>
      <div className="chat-messages" aria-live="polite">
        {chat.length === 0 ? (
          <p className="chat-empty">{UI_TEXT.notices.noChatYet}</p>
        ) : (
          chat.slice(-40).map((message, index) => (
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
