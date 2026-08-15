# DerivFX architecture

## Product shell
DerivFX is intentionally rebuilt around the same high-level workflow as Deriv Bot: three primary tabs only:

1. Dashboard
2. Bot Builder
3. Chart

DerivFX branding remains the product identity. The previous extra navigation tabs and legacy dashboard content are removed.

## Dashboard
The Dashboard uses the DBot-style load/build workflow with Local, Google Drive, Bot Builder and Quick strategy entry points. Unauthenticated visitors receive Log in and Sign up actions.

## Bot Builder
The Bot Builder provides a draggable block workspace with trading blocks for trade parameters, purchase conditions, sell conditions, restart conditions, plus additional logic, math, variable, time and contract-information blocks. The workspace is deliberately implemented as DerivFX code rather than copying proprietary source code from another application.

## Chart
Chart is a dedicated primary tab with a live Deriv market WebSocket, volatility-index selector, real-time tick price and tick-history visualization.

## Account authentication
The existing Deriv OAuth 2.0 Authorization Code + PKCE flow is preserved. The app continues to use `DERIV_APP_ID`, `DERIV_REDIRECT_URI`, and `DERIV_OAUTH_SCOPE`. After authentication, the server obtains the authorized account list and the browser connects to the short-lived Deriv account WebSocket OTP URL.

## Account switching
The account selector supports Real and Demo accounts, round account icons, balances, account IDs and logout. Logout clears the application session and returns the visitor to the unauthenticated screen with Log in / Sign up.

## Trading WebSocket
The authenticated Deriv WebSocket remains responsible for balance subscriptions and trade proposal/buy requests. The Run button is the single execution control: it starts a trade loop and changes to Stop while running. Real-money trading must be tested on Demo first and should use appropriate risk controls.

## Vercel
Set `DERIV_APP_ID`, `DERIV_REDIRECT_URI`, and `DERIV_OAUTH_SCOPE` in Vercel Project Settings -> Environment Variables. The redirect URI must exactly match the URI registered in the Deriv OAuth application.

## Production automation
Vercel serverless functions should not be treated as a continuously running autonomous worker. For unattended real-money automation, use a persistent backend/worker with reconnect handling, idempotency, audit logging and risk limits.
