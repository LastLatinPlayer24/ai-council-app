# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Use GitHub's private reporting instead: **Security → Report a vulnerability** on
this repository. You will get an answer within 7 days. Include what you found, how
to reproduce it and what an attacker could do with it.

## How AI Council handles secrets

- **Provider API keys** are stored only in the user's browser (`localStorage`).
  Each request sends them over HTTPS to this app's backend, which forwards them to
  the provider. The backend never stores or logs them. Use keys with a spending
  limit, and remove them from shared devices.
- **The backend is stateless.** Sessions, history and Forge calibrations live in
  the browser. There is no database and no account system.
- **Never set provider keys as server environment variables on a public
  deployment** — every visitor would spend your credits.

## Built-in protections

| Area | Protection |
|------|------------|
| SSRF | `custom_base_url` is validated; on Vercel only `https://` hosts that resolve to public IPs are accepted (decimal/hex IPs, IPv4-mapped IPv6, `nip.io`-style tricks and internal names are rejected). |
| Abuse | Per-IP token-bucket rate limit (`RATE_LIMIT_RPM`); add a platform-level rule (e.g. Vercel Firewall) on serverless, where memory is per instance. |
| Client IP | `x-real-ip` on Vercel; `X-Forwarded-For` only trusted with `TRUST_PROXY=1`. |
| Parameters | Model parameters are clamped twice: in the browser and in `sanitize_request` on the server. |
| Timeouts | Every provider call has connect/read limits (`STREAM_READ_TIMEOUT`). |
| Browser | Strict CSP (`script-src 'self'`), `X-Frame-Options: DENY`, HSTS, `nosniff`, restrictive `Permissions-Policy`. |
| Keys in transit | Model catalog requests send the key in `X-API-Key`, never in the query string. |

## Supported versions

Only the latest release on `main` receives security fixes.
