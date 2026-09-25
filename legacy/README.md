# Legacy prototype (not used)

This folder holds the first web/Express/Expo prototype. It is kept for reference only.
Nothing in `backend/` or `mobile/` imports from here, and it is not part of the npm workspaces.

Do not copy these known defects into new code (see `CLAUDE.md` → "Mavjud kod haqida"):

- `backend/controllers/authController.js`: OTP codes `7777` / `1234` always pass, default JWT secret,
  OTP kept in memory, 4-digit codes.
- `backend/services/paymeMerchant.js`: no Basic auth check, unknown users credited to `db.users[0]`,
  money as `float`.
- `backend/services/clickMerchant.js`: signature checked only in production, unknown users fall back
  to `db.users[0]`.
- `backend/services/eskizSms.js`: silently continues with a "demo token" when login fails.
- Starter bonus for everyone, `offers` (bargaining) model, colors that do not match the design.
- `docker-compose.yml` and `.env.example` contain literal secrets — never reuse them.
