# Wacky Chess Variants

A multiplayer browser game collection for unusual chess variants.

Current variants:

- 3D Chess: 8×8×8 plane-based chess.
- Normal Chess: standard 8×8 chess using the same game shell.

## Run locally

```powershell
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

## Account store

The Chess Lab now includes account storage for public-release preparation.

Default account data path:

```text
server/data/accounts.json
```

Recommended production environment override:

```text
ACCOUNT_STORE_PATH=/persistent-data/accounts.json
```

Accounts use PBKDF2-SHA256 password hashing with per-account salts. Session tokens are sent to clients once and only token hashes are stored server-side.

## Launch variant update

Added 3-Check, Anti-Chess, Anarchy Chess, and Rule Lab. Rule Lab uses a difficulty selector instead of normal time controls and a shared 15-minute timer. Anarchy Chess uses a side event feed so special rules can be referenced without crowding the rules list.


## Custom domain and supporter checkout

For a Wix-owned domain pointing at Render, keep the app hosted on Render and set these Render environment variables before redeploying:

```text
PUBLIC_SITE_URL=https://yourdomain.com
CLIENT_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
VITE_PUBLIC_SITE_URL=https://yourdomain.com
VITE_STRIPE_SUPPORT_URL=https://buy.stripe.com/YOUR_CHECKOUT_LINK
SUPPORT_UI_ENABLED=true
```

`VITE_SOCKET_URL` can normally stay blank because the client connects to `window.location.origin`. Only set it if the Socket.IO server is on a different domain from the web page.

When the Stripe link is not set, the home-page Support modal still opens but the checkout button is disabled.


### Support/Stripe visibility

The Support button can be toggled without redeploying from the dev console:

```text
support status
support enable
support disable
```

`SUPPORT_UI_ENABLED` only controls the first-run default. After that, the persistent server file `server/data/siteSettings.json` stores the current visibility setting.
