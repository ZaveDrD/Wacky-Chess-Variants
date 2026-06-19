import React, { useEffect, useRef, useState } from "react";
import { COLORS, PIECE_SYMBOLS } from "../game/config.js";

const WHEEL_THRESHOLD = 32;

export default function Board2D({
  game,
  plane,
  layer,
  selectedPieceId,
  legalMoveKeys,
  onSquareClick,
  onLayerChange,
  stacked = true,
  title,
  devVisuals = {},
  variantHighlights = []
}) {
  const [flipDirection, setFlipDirection] = useState("idle");
  const wheelDeltaRef = useRef(0);
  const animationTimerRef = useRef(null);

  useEffect(() => {
    wheelDeltaRef.current = 0;
  }, [plane, layer]);

  useEffect(() => () => window.clearTimeout(animationTimerRef.current), []);

  function handleWheel(event) {
    if (!onLayerChange) return;
    event.preventDefault();

    wheelDeltaRef.current += event.deltaY;
    if (Math.abs(wheelDeltaRef.current) < WHEEL_THRESHOLD) return;

    const direction = wheelDeltaRef.current > 0 ? 1 : -1;
    wheelDeltaRef.current = 0;

    const nextLayer = clamp(layer + direction, 0, 7);
    if (nextLayer === layer) return;

    setFlipDirection(direction > 0 ? "forward" : "backward");
    onLayerChange(nextLayer);

    window.clearTimeout(animationTimerRef.current);
    animationTimerRef.current = window.setTimeout(() => setFlipDirection("idle"), 260);
  }

  const ghostLayers = stacked ? getGhostLayers(layer) : [];

  return (
    <div className={`board-wrap ${stacked ? "board-wrap-stacked" : "board-wrap-flat"}`}>
      <div className="plane-title">
        {title || `${plane} plane · ${axisLayerText(plane, layer)}`}
      </div>

      <div
        className={`layer-stack ${stacked ? `layer-flip-${flipDirection}` : "flat-board-stack"}`}
        onWheel={stacked ? handleWheel : undefined}
        tabIndex={0}
        aria-label={`${plane} layer stack, current layer ${layer}`}
      >
        {ghostLayers.map((ghostLayer, index) => (
          <LayerCard
            key={`${plane}-${ghostLayer}-ghost-${index}`}
            game={game}
            plane={plane}
            layer={ghostLayer}
            selectedPieceId={selectedPieceId}
            legalMoveKeys={legalMoveKeys}
            ghostIndex={index + 1}
            isGhost
            devVisuals={devVisuals}
            variantHighlights={variantHighlights}
          />
        ))}

        <LayerCard
          key={`${plane}-${layer}-active`}
          game={game}
          plane={plane}
          layer={layer}
          selectedPieceId={selectedPieceId}
          legalMoveKeys={legalMoveKeys}
          onSquareClick={onSquareClick}
          isActive
          devVisuals={devVisuals}
          variantHighlights={variantHighlights}
        />

        {stacked && <div className="layer-badge">Layer {layer}</div>}
      </div>
    </div>
  );
}

function LayerCard({
  game,
  plane,
  layer,
  selectedPieceId,
  legalMoveKeys,
  onSquareClick,
  isActive = false,
  isGhost = false,
  ghostIndex = 0,
  devVisuals = {},
  variantHighlights = []
}) {
  const squares = [];

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const coord = mapPlaneToCoord(plane, layer, col, row);
      const piece = game.pieces.find((candidate) => sameCoord(candidate, coord));
      const legalMove = !isGhost ? legalMoveKeys.get(key(coord)) : null;
      const selected = !isGhost && piece?.id === selectedPieceId;
      const highlighted = !isGhost && (devVisuals.highlights || []).some((item) => sameCoord(item, coord));
      const variantHighlight = !isGhost ? variantHighlights.find((item) => sameCoord(item, coord)) : null;
      const ghostFrom = !isGhost && devVisuals.ghostMove?.from && sameCoord(devVisuals.ghostMove.from, coord);
      const ghostTo = !isGhost && devVisuals.ghostMove?.to && sameCoord(devVisuals.ghostMove.to, coord);
      const spotlight = !isGhost && devVisuals.spotlight && sameCoord(devVisuals.spotlight, coord);
      const ping = !isGhost && (devVisuals.pings || []).find((item) => sameCoord(item, coord));
      const fakeTrap = !isGhost && (devVisuals.fakeTraps || []).find((item) => sameCoord(item, coord));
      const fakeSmoke = !isGhost && (devVisuals.fakeSmoke || []).find((item) => sameCoord(item, coord));
      const cosmetic = !isGhost ? devVisuals.cosmetics?.pieces?.[coordText(coord)] : null;
      const light = (row + col) % 2 === 0;

      squares.push(
        <button
          key={`${coord.x}-${coord.y}-${coord.z}`}
          className={`square ${light ? "light" : "dark"} ${selected ? "selected" : ""} ${legalMove ? "legal" : ""} ${legalMove?.capture ? "capture" : ""} ${highlighted ? "dev-highlight" : ""} ${spotlight ? "dev-spotlight" : ""} ${ping ? "dev-ping" : ""} ${fakeTrap ? "fake-trap-square" : ""} ${fakeSmoke ? "fake-smoke-square" : ""} ${variantHighlight ? `variant-highlight ${variantHighlight.className || ""}` : ""} ${ghostFrom ? "ghost-from" : ""} ${ghostTo ? "ghost-to" : ""}`}
          style={{
            background: selected
              ? COLORS.selected
              : legalMove?.capture
                ? COLORS.captureMove
                : legalMove
                  ? COLORS.legalMove
                  : light
                    ? COLORS.lightSquare
                    : COLORS.darkSquare
          }}
          onClick={() => !isGhost && onSquareClick?.(coord)}
          title={`${plane}: x${coord.x} y${coord.y} z${coord.z}`}
          tabIndex={isActive ? 0 : -1}
          aria-hidden={isGhost ? "true" : undefined}
        >
          {devVisuals.showCoords && <span className="coord-label show">{coord.x},{coord.y},{coord.z}</span>}
          {ghostFrom && <span className="dev-marker from">A</span>}
          {ghostTo && <span className="dev-marker to">B</span>}
          {variantHighlight?.marker && <span className={`variant-marker ${variantHighlight.markerClass || ""}`}>{variantHighlight.marker}</span>}
          {fakeTrap && <span className="variant-marker fake-trap-marker">?</span>}
          {fakeSmoke && <span className="variant-marker fake-smoke-marker">☁</span>}
          {ping && <span className="variant-marker ping-marker">{ping.scooby ? "!" : "•"}</span>}
          {piece && (
            <span
              className={[
                "piece",
                piece.type === "wall" ? `${piece.owner || "white"} wall-piece` : piece.color,
                piece.shielded ? "shielded-piece" : "",
                piece.god ? "god-piece" : "",
                cosmetic?.size === "big" ? "cosmetic-size-big" : "",
                cosmetic?.size === "tiny" ? "cosmetic-size-tiny" : "",
                cosmetic?.spin ? "cosmetic-spin" : "",
                cosmetic?.jiggle ? "cosmetic-jiggle" : "",
                cosmetic?.glow ? "cosmetic-glow" : "",
                cosmetic?.ghost ? "cosmetic-ghost" : "",
                cosmetic?.clown ? "cosmetic-clown" : ""
              ].filter(Boolean).join(" ")}
              style={{
                color: piece.type === "wall" ? (piece.owner === "black" ? COLORS.blackPiece : COLORS.whitePiece) : piece.color === "white" ? COLORS.whitePiece : COLORS.blackPiece,
                "--cosmetic-glow": cosmetic?.glow || "currentColor"
              }}
              title={cosmetic?.name || cosmetic?.hat || cosmetic?.glow || undefined}
            >
              {getPieceSymbol(piece, devVisuals.cosmetics)}
              {piece.shielded && <span className="shield-marker">◆</span>}
              {piece.god && <span className="god-marker">✦</span>}
              {cosmetic?.hat && <span className="cosmetic-hat">{cosmetic.hat}</span>}
              {cosmetic?.mustache && <span className="cosmetic-mustache">〰</span>}
              {cosmetic?.name && <span className="cosmetic-name">{cosmetic.name}</span>}
            </span>
          )}
        </button>
      );
    }
  }

  const ghostStyle = isGhost
    ? {
        transform: `translate(${ghostIndex * 16}px, ${ghostIndex * 18}px) scale(${1 - ghostIndex * 0.035})`,
        opacity: ghostIndex === 1 ? 0.42 : 0.22,
        zIndex: 4 - ghostIndex
      }
    : undefined;

  return (
    <div
      className={`layer-card ${isActive ? "active-layer" : "ghost-layer"}`}
      style={ghostStyle}
      data-layer={layer}
    >
      <div className="board-2d">{squares}</div>
      {!isGhost && <PlaneAxisLabels plane={plane} />}
      {isGhost && <div className="ghost-layer-label">{axisLayerText(plane, layer)}</div>}
    </div>
  );
}

function coordText(coord) {
  return `(${coord.x},${coord.y},${coord.z})`;
}

function getPieceSymbol(piece, cosmetics = {}) {
  if (piece.type === "wall") return "⛨";
  const playerCosmetic = cosmetics?.players?.[piece.color] || {};
  if (playerCosmetic.duckify) return "🦆";
  if (playerCosmetic.scoobydoo && piece.type === "pawn") return "🐕";
  const override = cosmetics?.icons?.[`${piece.color}:${piece.type}`];
  return override || PIECE_SYMBOLS[piece.color]?.[piece.type] || "?";
}

function PlaneAxisLabels({ plane }) {
  const labels = getPlaneAxisLabels(plane);
  return (
    <div className={`plane-axis-labels plane-axis-${plane.toLowerCase()}`} aria-hidden="true">
      <span className="plane-axis-label plane-axis-primary">{labels.primary}</span>
      <span className="plane-axis-label plane-axis-secondary">{labels.secondary}</span>
    </div>
  );
}

function getPlaneAxisLabels(plane) {
  if (plane === "XZ") return { primary: "+X", secondary: "+Z" };
  if (plane === "XY") return { primary: "+X", secondary: "+Y" };
  return { primary: "+Z", secondary: "+Y" };
}

function getGhostLayers(layer) {
  const layers = [];

  if (layer > 0) layers.push(layer - 1);
  if (layer > 1) layers.push(layer - 2);

  if (layers.length === 0 && layer < 7) layers.push(layer + 1);
  if (layers.length === 1 && layer < 6) layers.push(layer + 2);

  return layers.slice(0, 2).reverse();
}

function mapPlaneToCoord(plane, layer, col, row) {
  if (plane === "XZ") return { x: col, y: layer, z: 7 - row };
  if (plane === "XY") return { x: col, y: 7 - row, z: layer };
  return { x: layer, y: 7 - row, z: col };
}

function axisLayerText(plane, layer) {
  if (plane === "XZ") return `y = ${layer}`;
  if (plane === "XY") return `z = ${layer}`;
  return `x = ${layer}`;
}

function sameCoord(a, b) {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

function key(coord) {
  return `${coord.x},${coord.y},${coord.z}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
