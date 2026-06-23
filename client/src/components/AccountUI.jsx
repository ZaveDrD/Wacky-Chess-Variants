import React from "react";
import { UI_TEXT } from "../game/text.js";
import { getVariantLabel } from "../game/variants.js";
import { profileIconUrl, getModeStats, formatDateShort } from "../game/uiHelpers.js";

export function AccountModal({
  open,
  account,
  accountMode,
  accountForm,
  accountEditForm,
  accountMessage,
  profileIcons,
  selectedVariant,
  onClose,
  onAccountMode,
  onAccountForm,
  onAccountEditForm,
  onAccountLogin,
  onAccountCreate,
  onProfileUpdate,
  onEmailUpdate,
  onPasswordUpdate,
  onAccountLogout
}) {
  if (!open) return null;
  const isRegister = accountMode === "register";
  const modeStats = getModeStats(account, selectedVariant);
  return (
    <div className="account-modal-backdrop">
      <section className="account-modal" role="dialog" aria-modal="true" aria-label={UI_TEXT.account.modalTitle}>
        <header className="account-modal-head">
          <div>
            <span className="eyebrow">{account ? UI_TEXT.account.accountBadge : UI_TEXT.account.guestBadge}</span>
            <h2>{account ? UI_TEXT.account.manageAccount : UI_TEXT.account.signedOutTitle}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={UI_TEXT.buttons.closeOverlay}>×</button>
        </header>

        {account ? (
          <div className="account-modal-grid">
            <aside className="account-profile-summary">
              <ProfileAvatar account={account} size="xl" />
              <h3>{account.username}</h3>
              <p>{account.email}</p>
              <small>{UI_TEXT.account.memberSince} {formatDateShort(account.createdAt)}</small>
              <div className="account-stat-strip">
                <span><strong>{account.stats?.totalGames || 0}</strong>{UI_TEXT.account.gamesLabel}</span>
                <span><strong>{account.stats?.wins || 0}</strong>{UI_TEXT.account.winsLabel}</span>
                <span><strong>{account.stats?.losses || 0}</strong>{UI_TEXT.account.lossesLabel}</span>
                <span><strong>{account.stats?.draws || 0}</strong>{UI_TEXT.account.drawsLabel}</span>
              </div>
              <div className="account-mode-stat-card">
                <strong>{getVariantLabel(selectedVariant)}</strong>
                <span>{modeStats.games}G · {modeStats.wins}W · {modeStats.losses}L · {modeStats.draws}D</span>
              </div>
            </aside>

            <div className="account-edit-panels">
              <form className="account-form account-edit-form" onSubmit={onProfileUpdate}>
                <h3>{UI_TEXT.account.profileSectionTitle}</h3>
                <label><span>{UI_TEXT.account.usernameLabel}</span><input value={accountEditForm.username} onChange={(event) => onAccountEditForm("username", event.target.value)} autoComplete="username" /></label>
                <div className="profile-icon-grid" aria-label={UI_TEXT.account.profileIconLabel}>
                  {profileIcons.map((icon) => (
                    <button key={icon} type="button" className={accountEditForm.profileIcon === icon ? "active" : ""} onClick={() => onAccountEditForm("profileIcon", icon)} title={icon}>
                      <img src={profileIconUrl(icon)} alt="" />
                    </button>
                  ))}
                </div>
                <button type="submit">{UI_TEXT.account.saveProfile}</button>
              </form>

              <form className="account-form account-edit-form" onSubmit={onEmailUpdate}>
                <h3>{UI_TEXT.account.emailSectionTitle}</h3>
                <label><span>{UI_TEXT.account.emailLabel}</span><input value={accountEditForm.email} onChange={(event) => onAccountEditForm("email", event.target.value)} type="email" autoComplete="email" /></label>
                <label><span>{UI_TEXT.account.currentPasswordLabel}</span><input value={accountEditForm.currentPassword} onChange={(event) => onAccountEditForm("currentPassword", event.target.value)} type="password" autoComplete="current-password" /></label>
                <button type="submit">{UI_TEXT.account.saveEmail}</button>
              </form>

              <form className="account-form account-edit-form" onSubmit={onPasswordUpdate}>
                <h3>{UI_TEXT.account.passwordSectionTitle}</h3>
                <label><span>{UI_TEXT.account.currentPasswordLabel}</span><input value={accountEditForm.currentPassword} onChange={(event) => onAccountEditForm("currentPassword", event.target.value)} type="password" autoComplete="current-password" /></label>
                <label><span>{UI_TEXT.account.newPasswordLabel}</span><input value={accountEditForm.newPassword} onChange={(event) => onAccountEditForm("newPassword", event.target.value)} type="password" autoComplete="new-password" /></label>
                <button type="submit">{UI_TEXT.account.savePassword}</button>
              </form>

              <button className="account-logout-button" type="button" onClick={onAccountLogout}>{UI_TEXT.account.logOut}</button>
            </div>
          </div>
        ) : (
          <div className="account-modal-auth">
            <p>{UI_TEXT.account.signedOutBody}</p>
            <div className="account-mode-tabs">
              <button type="button" className={!isRegister ? "active" : ""} onClick={() => onAccountMode("login")}>{UI_TEXT.account.showLogin}</button>
              <button type="button" className={isRegister ? "active" : ""} onClick={() => onAccountMode("register")}>{UI_TEXT.account.showRegister}</button>
            </div>
            <form className="account-form" onSubmit={isRegister ? onAccountCreate : onAccountLogin}>
              {isRegister ? (
                <>
                  <label><span>{UI_TEXT.account.emailLabel}</span><input value={accountForm.email} onChange={(event) => onAccountForm("email", event.target.value)} type="email" autoComplete="email" /></label>
                  <label><span>{UI_TEXT.account.usernameLabel}</span><input value={accountForm.username} onChange={(event) => onAccountForm("username", event.target.value)} autoComplete="username" /></label>
                </>
              ) : (
                <label><span>{UI_TEXT.account.loginLabel}</span><input value={accountForm.login} onChange={(event) => onAccountForm("login", event.target.value)} autoComplete="username" /></label>
              )}
              <label><span>{UI_TEXT.account.passwordLabel}</span><input value={accountForm.password} onChange={(event) => onAccountForm("password", event.target.value)} type="password" autoComplete={isRegister ? "new-password" : "current-password"} /></label>
              <button type="submit">{isRegister ? UI_TEXT.account.createAccount : UI_TEXT.account.logIn}</button>
            </form>
          </div>
        )}
        {accountMessage && <small className="account-message modal-message">{accountMessage}</small>}
      </section>
    </div>
  );
}

export function ProfileAvatar({ account, size = "normal" }) {
  const icon = account?.profile?.icon || "lab-pawn.svg";
  return <img className={`profile-avatar ${size}`} src={profileIconUrl(icon)} alt="" />;
}

export function GuestAvatar({ size = "normal" }) {
  return <img className={`profile-avatar guest-avatar ${size}`} src={profileIconUrl("anonymous.svg")} alt="" />;
}

export function SettingsButton({
  open,
  onToggle,
  soundEnabled,
  soundVolume,
  censorContent,
  account,
  accountMode,
  accountForm,
  accountMessage,
  onAccountMode,
  onAccountForm,
  onAccountLogin,
  onAccountCreate,
  onAccountLogout,
  onAccountOpen,
  onSoundToggle,
  onVolume,
  onCensorToggle
}) {
  return (
    <div className="settings-cluster">
      <button className="settings-cog" type="button" onClick={onToggle} aria-label="Open settings" title="Settings">⚙</button>
      {open && (
        <section className="settings-menu" aria-label={UI_TEXT.settings.title}>
          <div className="settings-menu-head">
            <strong>{UI_TEXT.settings.title}</strong>
          </div>
          <label className="settings-toggle-row">
            <span>{UI_TEXT.settings.sound}</span>
            <button type="button" className={soundEnabled ? "enabled" : ""} onClick={onSoundToggle}>{soundEnabled ? UI_TEXT.settings.on : UI_TEXT.settings.off}</button>
          </label>
          {soundEnabled && (
            <label className="settings-slider-row">
              <span>{UI_TEXT.settings.volume}</span>
              <input type="range" min="0" max="1" step="0.05" value={soundVolume} onChange={(event) => onVolume(Number(event.target.value))} />
            </label>
          )}
          <label className="settings-toggle-row">
            <span>{UI_TEXT.settings.localCensor}</span>
            <button type="button" className={censorContent ? "enabled" : ""} onClick={onCensorToggle}>{censorContent ? UI_TEXT.settings.on : UI_TEXT.settings.off}</button>
          </label>
          <p>{UI_TEXT.settings.censorHelp}</p>

          <button className="settings-account-panel compact-account-panel settings-account-clickable" type="button" onClick={onAccountOpen} title={account ? UI_TEXT.account.manageAccountHelp : UI_TEXT.account.signedOutBody}>
            {account ? <ProfileAvatar account={account} /> : <GuestAvatar />}
            <span className="settings-account-copy">
              <span className="eyebrow">{account ? UI_TEXT.account.accountBadge : UI_TEXT.account.guestBadge}</span>
              <strong>{account ? account.username : UI_TEXT.account.signedOutTitle}</strong>
              <small>{account ? UI_TEXT.account.manageAccountHelp : UI_TEXT.account.signedOutBody}</small>
            </span>
          </button>
        </section>
      )}
    </div>
  );
}
