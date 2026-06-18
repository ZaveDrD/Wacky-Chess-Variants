import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { socket } from "./socket.js";
import Board2D from "./components/Board2D.jsx";
const Board3D = lazy(() => import("./components/Board3D.jsx"));
import { PIECE_SYMBOLS } from "./game/config.js";
import { UI_TEXT } from "./game/text.js";
import { VARIANT_OPTIONS, TIME_CONTROL_OPTIONS, getVariantLabel, getTimeControlLabel } from "./game/variants.js";
import { buildReviewTimeline } from "./game/replay.js";

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
    });

    socket.on("gameState", (newGame) => {
      setGame(newGame);
      if (newGame.variant === "normal") {
        setView("XZ");
        setLayer(0);
      }
      setSelectedPieceId(null);
      setLegalMoves([]);
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
      socket.off("legalMoves");
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setClockTick(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

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

  function saveName() {
    const clean = name.trim() || "Player";
    localStorage.setItem("playerName", clean);
    localStorage.setItem("selectedVariant", selectedVariant);
    localStorage.setItem("selectedTimeControl", selectedTimeControl);
    return clean;
  }

  function createRoom(override = {}) {
    socket.emit("createRoom", {
      name: saveName(),
      variant: override.variant || selectedVariant,
      timeControl: override.timeControl || selectedTimeControl
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
    setReviewMode(false);
    setReviewPlaying(false);
    setReviewIndex(0);
    setDismissedGameOver(false);
    setShowForfeitConfirm(false);
    createRoom({ variant: nextVariant, timeControl: nextTimeControl });
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
    if (role === "spectator" || color === "spectator") {
      setNotice(UI_TEXT.notices.spectatorNoMove);
      return;
    }
    if (piece.color !== color) {
      setNotice(UI_TEXT.notices.opponentPiece);
      return;
    }
    if (game.turn !== color) {
      setNotice(UI_TEXT.notices.notYourTurn);
      return;
    }
    socket.emit("selectPiece", { roomCode, pieceId: piece.id });
  }

  function attemptMove(to) {
    if (reviewMode || role === "spectator" || color === "spectator") return;
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
    if (role === "spectator" || color === "spectator") {
      setNotice(UI_TEXT.notices.spectatorNoMove);
      return;
    }
    const piece = game.pieces.find((candidate) => sameCoord(candidate, coord));

    if (piece && piece.color === color && game.turn === color) {
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

          <label>
            {UI_TEXT.lobby.nameLabel}
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder={UI_TEXT.lobby.namePlaceholder} />
          </label>

          <button className="primary" onClick={() => createRoom()}>{UI_TEXT.lobby.hostButton}</button>

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
      </main>
    );
  }

  return (
    <main className="app game-app">
      <section className="top-bar">
        <div>
          <h1>{getVariantLabel(game.variant)}</h1>
          <p className="subtle">
            {UI_TEXT.labels.room}{" "}
            <strong className="room-code-copy" onClick={copyRoomCode} title="Click to copy room code">{roomCode}</strong>
            {" · "}{getTimeControlLabel(game.timeControl)}
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
    </main>
  );
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

function isTurnOnlyMessage(message) {
  return /^(white|black) to move\.?$/i.test(String(message || "").trim());
}
