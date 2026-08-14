# DerivFX

Third-party Deriv trading dashboard foundation with a dBot-inspired workflow and an independent DerivFX interface.

## Implemented
- Dark/navy dBot-style top navigation with Dashboard, Bot Builder, AI Bots, Quick Bot, Free Bots, Signals, Analysis, Auto Trader and Deriv Course.
- No bottom navigation.
- Relevant original SVG visual artwork changes with each tab.
- Persistent draggable floating AI Scanner.
- FAST/SLOW execution is a tap-to-switch control.
- Run / Pause / Resume uses one button; red Stop appears only after execution starts.
- Open Transactions expands upward above the execution bar.
- OAuth 2.0 Authorization Code + PKCE.
- HttpOnly secure access-token cookie.
- Current Deriv Options REST account discovery and one-time OTP WebSocket authentication.
- Live balance, portfolio and tick subscription foundation.
- Vercel environment-variable template.

## Vercel environment variables
Set these in Vercel Project Settings -> Environment Variables:
- `DERIV_APP_ID`
- `DERIV_REDIRECT_URI`
- `DERIV_OAUTH_SCOPE` (normally `trade`)
- `DERIV_LEGACY_APP_ID` only when maintaining a legacy V1 application.

Do not commit real credentials. The redirect URI must exactly match the URI registered with Deriv.

## Local development
```bash
npm install
npm run dev
```

## Deriv connection architecture
OAuth login -> authorization code + PKCE -> server token exchange -> `GET /trading/v1/options/accounts` -> `POST /trading/v1/options/accounts/{accountId}/otp` -> connect to the returned one-time WebSocket URL -> subscribe to balance/portfolio/ticks and perform trading operations.

Current Deriv documentation:
- https://developers.deriv.com/docs/intro/oauth/
- https://developers.deriv.com/docs/options/
- https://developers.deriv.com/docs/options/get-accounts/
- https://developers.deriv.com/docs/options/websocket/
- https://developers.deriv.com/docs/workflows/

## Production warning
Vercel is suitable for the web application and request/response API layer, but a continuously autonomous real-money bot should use a persistent backend/worker with reconnect handling, idempotency, audit logs, strict stake/loss controls and explicit real-account confirmation. Test trading paths on a demo account first.
