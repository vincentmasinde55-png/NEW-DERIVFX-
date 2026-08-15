# DerivFX Real DBot Execution

DerivFX is intended to be a real authenticated Deriv trading application, not a simulated trading demo.

## Connection

The application reads the existing Vercel environment variables without hard-coding credentials:

- `DERIV_APP_ID`
- `DERIV_REDIRECT_URI`
- existing OAuth/session secrets already configured in Vercel

The browser starts the OAuth flow, the callback establishes the authenticated session, and the server exchanges the authorized account information for the Deriv WebSocket connection used by the trading UI.

## Execution lifecycle

1. User selects Real or Demo after authentication.
2. The server identifies the selected account and obtains its authorized WebSocket endpoint/token.
3. The client maintains a persistent WebSocket connection.
4. Bot Builder produces validated contract parameters.
5. Before every purchase the client requests a fresh proposal.
6. The returned proposal ID and ask price are passed to `buy`.
7. Contract updates are subscribed to so the UI can show open positions and final results.
8. Balance, transactions and journal state are updated from WebSocket responses.
9. Stop cancels the bot scheduler; it does not pretend to cancel an already purchased Deriv contract unless an explicit sell operation is supported for that contract.

## Required UI states

The Run control must clearly distinguish:

- `Run` — bot is stopped and ready.
- `Starting…` — proposal/execution setup is being established.
- `Running` — bot scheduler is active.
- `Stop` — stops new executions.
- `Error` — execution failed and the reason is shown in Journal.

## Real-money safeguards

The execution layer must never silently substitute demo credentials for a real account, fabricate balances, or claim a purchase succeeded when Deriv returned an error. Every buy must be confirmed from the Deriv response before being recorded as an executed transaction.

For unattended strategies, stake, maximum trades, loss limits, and optional stop conditions should be explicit bot settings. Users should test strategies on Demo before switching to Real.
