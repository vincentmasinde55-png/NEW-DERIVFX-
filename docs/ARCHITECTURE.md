# DerivFX architecture

## Authentication
The app uses Deriv OAuth 2.0 Authorization Code + PKCE. The server generates a fresh verifier/challenge and state, redirects to Deriv, validates the callback state, exchanges the authorization code server-side, and stores the access token in an HttpOnly secure cookie.

## Current Deriv connection flow
1. GET `/trading/v1/options/accounts` with `Authorization: Bearer` and `Deriv-App-ID`.
2. Select the desired demo/real Options account.
3. POST `/trading/v1/options/accounts/{accountId}/otp` with the same credentials.
4. Connect the browser WebSocket to the returned one-time URL.
5. Subscribe to balance, portfolio and market ticks.

The OTP URL is short-lived and single-use, so the WebSocket connection is opened immediately after generation.

## UI execution state
- Idle: Run visible; Stop hidden.
- Running: Pause visible; Stop visible.
- Paused: Resume visible; Stop visible.
- Stopped: Run visible; Stop hidden.
- FAST/SLOW is a tap button that switches state.
- Open Transactions expands upward above the execution bar.
- AI Scanner is fixed, draggable and persists across all tabs.

## Vercel
Set `DERIV_APP_ID`, `DERIV_REDIRECT_URI`, and `DERIV_OAUTH_SCOPE` in Vercel Project Settings -> Environment Variables. The redirect URI must exactly match the URI registered in the Deriv OAuth application.

## Production trading
Vercel serverless functions should not be treated as a continuously running autonomous bot worker. For real-money automation, use a persistent backend/worker with reconnect handling, idempotency, audit logging, risk limits, real-account confirmation and demo-account testing.
