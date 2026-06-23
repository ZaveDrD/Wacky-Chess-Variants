import React from "react";
import { UI_TEXT } from "../game/text.js";
import { getVariantLabel, getTimeControlLabel } from "../game/variants.js";
import { getVariantCategory, getTimeControlDescription, getAIDifficultyDescription, formatElapsed } from "../game/uiHelpers.js";

export function ChoiceGallery({ title, subtitle, items, selectedId, getDescription, getMeta, onSelect, onBack }) {
  return (
    <div className="choice-gallery">
      <header className="choice-gallery-header">
        <div>
          <span className="eyebrow">Experiment Gallery</span>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <button type="button" onClick={onBack}>Back</button>
      </header>
      <div className="choice-card-grid">
        {items.map((item, index) => (
          <button
            key={item.id}
            className={`choice-card ${selectedId === item.id ? "selected" : ""}`}
            type="button"
            style={{ "--delay": `${index * 45}ms` }}
            onClick={() => onSelect(item.id)}
          >
            <span>{getMeta(item.id)}</span>
            <strong>{item.label}</strong>
            <small>{getDescription(item.id)}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

export function QueueSearchPanel({ variant, timeControl, scope, elapsed, onCancel }) {
  return (
    <div className="queue-search-panel">
      <div className="queue-orbit" aria-hidden="true">
        <span>♔</span><span>♞</span><span>♜</span><i />
      </div>
      <span className="eyebrow">Open Lab Queue</span>
      <h2>Finding match...</h2>
      <p>{scope === "any" ? "Searching every public experiment queue." : `Searching ${variant} · ${timeControl}.`}</p>
      <strong className="queue-timer">{formatElapsed(elapsed)}</strong>
      <button className="secondary-action-button" type="button" onClick={onCancel}>Cancel Search</button>
    </div>
  );
}

export function MatchFoundOverlay({ match }) {
  if (!match) return null;
  return (
    <div className="versus-overlay">
      <div className="versus-card">
        <span>{UI_TEXT.versus.matched}</span>
        <div className="versus-row"><VersusPlayer player={match.white} /><strong>VS</strong><VersusPlayer player={match.black} /></div>
      </div>
    </div>
  );
}

export function VersusPlayer({ player }) {
  return <div className="versus-player"><h3>{player?.name || "Player"}</h3><p>{player?.color} · {UI_TEXT.versus.elo} {player?.elo || "guest"} · {UI_TEXT.versus.rank} {player?.rank || "—"}</p></div>;
}

export function LeaderboardPanel({ data, variant, scope, onScope, onRefresh, onProfile }) {
  const entries = data?.entries || [];
  return (
    <div className="leaderboard-panel">
      <header>
        <div><h3>{UI_TEXT.leaderboard.title}</h3><p>{getVariantLabel(variant)} · {UI_TEXT.leaderboard.top100}</p></div>
        <div><button className={scope === "month" ? "active" : ""} onClick={() => onScope("month")}>{UI_TEXT.leaderboard.monthly}</button><button className={scope === "allTime" ? "active" : ""} onClick={() => onScope("allTime")}>{UI_TEXT.leaderboard.allTime}</button><button onClick={onRefresh}>↻</button></div>
      </header>
      <div className="leaderboard-list">
        {entries.length ? entries.map((entry, index) => (
          <button key={entry.accountId} className={`leaderboard-row rank-${index + 1}`} onClick={() => onProfile(entry.accountId)}>
            <span>{index === 0 ? "👑" : index === 1 ? "♕" : index === 2 ? "♔" : index + 1}</span>
            <strong>{entry.username}</strong>
            <em>{UI_TEXT.leaderboard.elo} {entry.elo}</em>
            <small>{entry.games}G {entry.wins}W {entry.losses}L</small>
          </button>
        )) : <p className="subtle">No leaderboard entries yet.</p>}
      </div>
    </div>
  );
}
