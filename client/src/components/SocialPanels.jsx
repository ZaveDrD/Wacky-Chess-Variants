import React from "react";
import { UI_TEXT } from "../game/text.js";
import { getVariantLabel, getTimeControlLabel } from "../game/variants.js";
import { formatDateShort } from "../game/uiHelpers.js";

export function FriendsDrawer({ open, account, socialState, friendTarget, onToggle, onTarget, onSendRequest, onRespondRequest, onProfile, onMessage, onChallenge }) {
  if (!account) return null;
  const friends = socialState?.friends || [];
  const requests = socialState?.requests || [];
  return (
    <aside className={`friends-drawer ${open ? "open" : ""}`}>
      <button className="friends-tab" type="button" onClick={onToggle}>{UI_TEXT.social.friendsTitle}</button>
      <div className="friends-panel">
        <h2>{UI_TEXT.social.friendsTitle}</h2>
        <div className="friend-add-row">
          <input value={friendTarget} onChange={(event) => onTarget(event.target.value)} placeholder={UI_TEXT.social.addFriendPlaceholder} />
          <button type="button" onClick={onSendRequest}>{UI_TEXT.social.sendRequest}</button>
        </div>
        <h3>{UI_TEXT.social.friendRequests}</h3>
        {requests.length ? requests.map((request) => (
          <div className="friend-row" key={request.id}>
            <strong>{request.fromUsername}</strong>
            <span>
              <button onClick={() => onRespondRequest(request.id, true)}>{UI_TEXT.social.accept}</button>
              <button onClick={() => onRespondRequest(request.id, false)}>{UI_TEXT.social.deny}</button>
            </span>
          </div>
        )) : <p className="subtle">{UI_TEXT.social.noRequests}</p>}
        <h3>{UI_TEXT.social.friendsTitle}</h3>
        {friends.length ? friends.map((friend) => (
          <div className="friend-row" key={friend.accountId}>
            <button className="friend-name" onClick={() => onProfile(friend.accountId)}>{friend.username}</button>
            <small>{friend.online ? UI_TEXT.social.online : UI_TEXT.social.offline}{friend.inGame ? ` · ${UI_TEXT.social.inGame}` : ""}</small>
            <span className="friend-actions">
              <button onClick={() => onProfile(friend.accountId)}>{UI_TEXT.buttons.viewProfile}</button>
              <button onClick={() => onChallenge(friend)}>{UI_TEXT.buttons.challenge}</button>
              <button onClick={() => onMessage(friend)}>{UI_TEXT.buttons.message}</button>
            </span>
          </div>
        )) : <p className="subtle">{UI_TEXT.social.noFriends}</p>}
      </div>
    </aside>
  );
}

export function FriendMessageWindow({ friend, messages, draft, onDraft, onSend, onClose }) {
  if (!friend) return null;
  const relevant = (messages || []).filter((message) => message.fromAccountId === friend.accountId || message.toAccountId === friend.accountId).slice(-40);
  return (
    <section className="friend-chat-window">
      <header><strong>{friend.username}</strong><button onClick={onClose}>×</button></header>
      <div className="friend-chat-messages">
        {relevant.map((message) => <p key={message.id} className={message.fromAccountId === friend.accountId ? "incoming" : "outgoing"}>{message.body}</p>)}
      </div>
      <footer>
        <input value={draft} onChange={(event) => onDraft(event.target.value)} placeholder={UI_TEXT.social.messagePlaceholder} />
        <button onClick={onSend}>{UI_TEXT.buttons.sendChat}</button>
      </footer>
    </section>
  );
}

export function ChallengeNotice({ challenge, onAccept, onDeny }) {
  if (!challenge) return null;
  return (
    <div className="challenge-toast">
      <strong>{UI_TEXT.social.challengeReceived}</strong>
      <p>{challenge.fromUsername || "Friend"} · {getVariantLabel(challenge.variant)} · {getTimeControlLabel(challenge.timeControl)}</p>
      <button onClick={onAccept}>{UI_TEXT.social.accept}</button>
      <button onClick={onDeny}>{UI_TEXT.social.deny}</button>
    </div>
  );
}

export function PunishmentNoticeModal({ notice, appealText, onAppealText, onSubmit, onClose }) {
  if (!notice?.punishments?.length) return null;
  const punishment = notice.punishments[0];
  const expiry = punishment.expiresAt === -1 ? "Permanent" : new Date(punishment.expiresAt).toLocaleString();
  return (
    <div className="modal-backdrop">
      <section className="game-over-modal pop-modal punishment-modal">
        <button className="modal-close" onClick={onClose}>×</button>
        <h2>{UI_TEXT.reports.punishmentTitle}</h2>
        <p><strong>{punishment.type}</strong> · {expiry}</p>
        <p>{punishment.reason}</p>
        <textarea value={appealText} onChange={(event) => onAppealText(event.target.value)} placeholder={UI_TEXT.reports.appealPlaceholder} />
        <button className="primary" onClick={onSubmit}>{UI_TEXT.reports.submitAppeal}</button>
      </section>
    </div>
  );
}

export function PublicProfileModal({ profile, onClose }) {
  if (!profile) return null;
  const byVariant = Object.entries(profile.stats?.byVariant || {});
  return (
    <div className="modal-backdrop">
      <section className="game-over-modal pop-modal public-profile-modal">
        <button className="modal-close" onClick={onClose}>×</button>
        <div className="public-profile-head">
          <img src={`/profile-icons/${profile.profile?.icon || "anonymous.svg"}`} alt="" />
          <div><h2>{profile.username}</h2><p>{UI_TEXT.account.memberSince} {formatDateShort(profile.createdAt)}</p></div>
        </div>
        <h3>{UI_TEXT.profile.overallStats}</h3>
        <p>{profile.stats?.totalGames || 0} {UI_TEXT.account.gamesLabel} · {profile.stats?.wins || 0} {UI_TEXT.account.winsLabel} · {profile.stats?.losses || 0} {UI_TEXT.account.lossesLabel} · {profile.stats?.draws || 0} {UI_TEXT.account.drawsLabel}</p>
        <h3>{UI_TEXT.profile.modeStats}</h3>
        {byVariant.length ? byVariant.map(([variant, stats]) => <p key={variant}><strong>{getVariantLabel(variant)}</strong>: {stats.games}G {stats.wins}W {stats.losses}L {stats.draws}D · {UI_TEXT.profile.worldRank}: {profile.ranks?.[variant] || "—"}</p>) : <p className="subtle">No games recorded.</p>}
      </section>
    </div>
  );
}

export function ReportCaseModal({ reportCase, onClose }) {
  if (!reportCase) return null;
  return (
    <div className="modal-backdrop">
      <section className="game-over-modal pop-modal report-case-modal">
        <button className="modal-close" onClick={onClose}>×</button>
        <h2>{reportCase.id}</h2>
        <p><strong>{reportCase.evidence?.strength}</strong> evidence · {reportCase.reporter?.name} → {reportCase.reported?.name}</p>
        <p>{reportCase.reason}</p>
        <h3>Illegal moves</h3>
        <div className="report-scroll-list">{(reportCase.slice?.illegalMoveAttempts || []).slice(-30).map((item, index) => <p key={index}>{item.player}: {item.reason}</p>)}</div>
        <h3>Chat logs</h3>
        <div className="report-scroll-list">{(reportCase.slice?.chat || []).slice(-80).map((message) => <p key={message.id}>{message.name}: {message.body}</p>)}</div>
      </section>
    </div>
  );
}
