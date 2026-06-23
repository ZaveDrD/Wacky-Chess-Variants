# Refactor Pass Notes

This version is intended as a safe cleanup/compartmentalisation pass, not a feature change.

## Main changes

- Split pure UI helpers out of `client/src/App.jsx` into `client/src/game/uiHelpers.js`.
- Split large UI sections into component modules:
  - `client/src/components/AccountUI.jsx`
  - `client/src/components/GameShell.jsx`
  - `client/src/components/LobbyPanels.jsx`
  - `client/src/components/SocialPanels.jsx`
  - `client/src/components/VariantPanels.jsx`
  - `client/src/components/DevFxLayer.jsx`
  - `client/src/components/NetworkDashboardModal.jsx`
- Split the largest CSS file into:
  - `client/src/styles.css` for base/game layout styles
  - `client/src/styles/devTools.css` for dev console, FX, cosmetics, and network monitor styles
  - `client/src/styles/chessLabHome.css` for Chess Lab home/account/social/leaderboard styles
- Kept imports ordered so the cascade matches the previous single-file CSS order.

## Size change

- `App.jsx`: ~168 KB -> ~109 KB.
- `styles.css`: ~138 KB -> ~87 KB, with later sections moved into scoped files.
- Built client bundle size is intentionally similar, because this pass focused on source navigation and safer maintainability rather than changing runtime behaviour.

## Validation

- Server syntax checks passed.
- Client production build passed.
- Existing Board3D chunk-size warning remains unchanged.
