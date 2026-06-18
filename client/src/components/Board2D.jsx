import React, { useEffect, useRef, useState } from "react";
import { COLORS, PIECE_ICONS } from "../game/config.js";

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
  devVisuals = {}
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
  devVisuals = {}
}) {
  const squares = [];

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const coord = mapPlaneToCoord(plane, layer, col, row);
      const piece = game.pieces.find((candidate) => sameCoord(candidate, coord));
      const legalMove = !isGhost ? legalMoveKeys.get(key(coord)) : null;
      const selected = !isGhost && piece?.id === selectedPieceId;
      const highlighted = !isGhost && (devVisuals.highlights || []).some((item) => sameCoord(item, coord));
      const ghostFrom = !isGhost && devVisuals.ghostMove?.from && sameCoord(devVisuals.ghostMove.from, coord);
      const ghostTo = !isGhost && devVisuals.ghostMove?.to && sameCoord(devVisuals.ghostMove.to, coord);
      const light = (row + col) % 2 === 0;

      squares.push(
        <button
          key={`${coord.x}-${coord.y}-${coord.z}`}
          className={`square ${light ? "light" : "dark"} ${selected ? "selected" : ""} ${legalMove ? "legal" : ""} ${legalMove?.capture ? "capture" : ""} ${highlighted ? "dev-highlight" : ""} ${ghostFrom ? "ghost-from" : ""} ${ghostTo ? "ghost-to" : ""}`}
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
          {piece && (
            <span
              className={`piece ${piece.color}`}
              style={{ color: piece.color === "white" ? COLORS.whitePiece : COLORS.blackPiece }}
            >
              <img src={PIECE_ICONS[piece.color][piece.type]} alt={`${piece.color} ${piece.type}`} className="piece-icon" draggable="false" />
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
