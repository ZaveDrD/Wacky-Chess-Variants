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
