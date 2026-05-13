## What Changed

- Briefly describe the business goal and technical scope.

## Security Checklist

- [ ] `server/security.test.cjs` passes locally or in CI.
- [ ] CSP / cookie / auth-session behavior unchanged or intentionally updated.
- [ ] Refresh-token logic reviewed (including fingerprint mismatch path).

## Integration Checklist

- [ ] `security-regression` check is green.
- [ ] `integration-full-cycle` check is green.
- [ ] Full chain verified: train -> predict -> doctor feedback -> retrain trigger.

## Data & ML Checklist

- [ ] Model/version compatibility considered (no artifact format break).
- [ ] If feature-selection/training changed, env vars and README updated.
- [ ] Health endpoints and metrics still valid.

## Test Evidence

- Paste key command outputs or CI links:
  - `npm run test:node -- server/security.test.cjs`
  - `npm run test:integration:fullcycle`

## Risks / Rollback

- Known risks:
- Rollback plan:
