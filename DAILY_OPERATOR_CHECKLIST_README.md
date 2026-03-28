# Daily Operator Checklist (Admin Dashboard)

This checklist is for daily operation of the StockBaller monitoring dashboard.

## 1) Start Of Day

- [ ] Start API service and confirm it is reachable.
- [ ] Start dashboard static server.
- [ ] Open `simulation-dashboard/admin.html`.
- [ ] Log in with admin password.
- [ ] Confirm API status is online in the top bar.

## 2) Feed Source Health (Task 2.1)

- [ ] Check Action Monitor source badge.
- [ ] Confirm badge behavior:
  - `canonical` when canonical activity endpoints are reachable and providing usable event rows.
  - `canonical-low` when canonical data is present but below the higher-volume threshold for the recent window.
  - `fallback` only when canonical fetch fails and the dashboard drops to legacy activity endpoints.
  - `offline` only when both canonical and fallback are unavailable.
- [ ] Confirm badge updates before feed rows refresh.
- [ ] Confirm low-volume canonical behavior:
  - Canonical data with non-zero events remains visible (does not auto-switch to fallback).
  - Badge shows `canonical-low` when event volume is below threshold.

## 3) Bot Fleet Monitoring

- [ ] Verify active bot count and total bot count.
- [ ] Check total trades, fees, and PnL values are updating.
- [ ] Check holdings table and recent activity feed for stale data.
- [ ] Scan for abnormal spikes in rapid BUY/SELL loops.

## 4) User Action Monitor

- [ ] Review actions per minute and active actor counts.
- [ ] Check success/failure/rejection rates.
- [ ] Use filters (All/Live/Agent/Bot) and confirm rows update.
- [ ] Inspect top actors list and actor inspector for anomalies.

## 5) Audit Trail Panel

- [ ] Open "Audit Trail (Bot & Agent Actions)" panel.
- [ ] Verify totals: trades, wins, losses, volume, net PnL.
- [ ] Apply filters: game type, action, status, and time window.
- [ ] Search by actor or player and confirm matching rows.
- [ ] Check pagination and ensure page counts are correct.
- [ ] Verify amount presentation quality:
  - Contest and prediction amounts display in normal USD units.
  - Missing values display as `-` instead of `$0.00`.
  - Failed balance rows show required amount hints when available.
- [ ] Verify rejection readability:
  - Rejected/failed rows include short reason tags (for example `ALREADY_ENTERED`, `INSUFFICIENT_BALANCE`).

## 6) Incident Handling

- [ ] If source becomes `fallback`, monitor for 5-10 minutes.
- [ ] If source becomes `offline`, notify engineering immediately.
- [ ] Capture screenshot of dashboard state.
- [ ] Record timestamp, source state, and affected panels.
- [ ] Save API errors from browser console if available.

## 7) End Of Day

- [ ] Record daily summary:
  - total trades
  - wins/losses
  - net PnL
  - source stability (canonical vs fallback duration)
- [ ] Note any incidents and recovery actions.
- [ ] Hand off unresolved issues to next operator.

## 8) Quick Validation Commands (Optional)

From project root:

```powershell
node serve-dashboard.js
```

Health check examples:

```powershell
# Canonical feed stats (5m)
curl "http://localhost:3001/api/activity/events/stats?userType=all&windowMinutes=5"

# Canonical feed events
curl "http://localhost:3001/api/activity/events?userType=all&limit=50&offset=0"

# Audit trail (all game types)
curl "http://localhost:3001/api/activity/audit-trail?limit=50&offset=0"

# Audit trail (single game type example)
curl "http://localhost:3001/api/activity/audit-trail?gameType=H2H&limit=50&offset=0"
```

## 9) Escalation Trigger

Escalate to engineering if any condition persists for more than 10 minutes:

- [ ] Source remains `offline`
- [ ] Source remains `fallback` with no recovery to canonical
- [ ] Audit trail not updating
- [ ] PnL or volume values stop changing while bots are active
