import React from "react";
import { PIECE_SYMBOLS } from "../game/config.js";

export function VariantControls({
  game,
  color,
  disabled,
  selectedDropType,
  selectedTycoonAction,
  selectedScoobyAction,
  nukeTargeting,
  onReserveSelect,
  onNukeTarget,
  onTycoonSelect,
  onTycoonInstant,
  onScoobySelect
}) {
  if (!game || !["crazyhouse", "nuke", "tycoon", "predict", "scooby"].includes(game.variant)) return null;
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
      {game.variant === "predict" && <PredictPanel game={game} color={color} />}
      {game.variant === "scooby" && (
        <ScoobyPanel
          game={game}
          color={color}
          disabled={disabled}
          selectedAction={selectedScoobyAction}
          onSelect={onScoobySelect}
        />
      )}
    </section>
  );
}

export function NukePanel({ game, color, disabled, targeting, onTarget }) {
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

export function TycoonPanel({ game, color, disabled, selectedAction, onSelect, onInstant }) {
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

export function TycoonActionButton({ label, cost, active, disabled, onClick, wide }) {
  return (
    <button type="button" className={`${active ? "active" : ""} ${wide ? "wide" : ""}`} disabled={disabled} onClick={onClick}>
      <span>{label}</span>
      <strong>{typeof cost === "number" ? `$${cost}` : cost}</strong>
    </button>
  );
}

export function getTycoonCostsClient(storageLevel, productionLevel) {
  return {
    pieces: { pawn: 3, knight: 7, bishop: 7, rook: 10, queen: 15 },
    wall: 3,
    shield: 5,
    bomb: 5,
    storage: [5, 8, 12, 16, 22][storageLevel] || 28,
    production: [8, 14, 22][productionLevel] ?? Infinity
  };
}

export function PredictPanel({ game, color }) {
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

export function ScoobyPanel({ game, color, disabled, selectedAction, onSelect }) {
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
      <div className="scooby-legend">
        <span className="scooby-legend-chip own"><strong>Yours</strong><small>green ring</small></span>
        <span className="scooby-legend-chip detected"><strong>Detected enemy</strong><small>gold ring</small></span>
      </div>
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

export function ReservePanel({ reserves, color, selectedDropType, disabled, onSelect }) {
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
