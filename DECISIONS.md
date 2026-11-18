# DECISIONS.md — FinPilot Backend

## Assumptions

- Single currency (INR) throughout; no multi-currency conversion.
- `GET /api/v1/instruments` was added beyond the minimum API surface to populate instrument filter dropdowns in the frontend without hardcoding values client-side.
- In-memory CSV upload via `multer` is capped at 5 MB, sufficient for the supplied synthetic datasets.
- `goal_id_seq` starts at 178 so goals created via the API continue the existing seeded sequence (`G00178+`) without colliding with the 177 seeded records (`G00001–G00177`).
- Holdings snapshot represents a single end-of-day position per `(account, instrument, date)`; there is no intra-day or historical price feed.
- Identical `401` responses for unknown email, inactive account, and wrong password are intentional to prevent email enumeration.
- `NUMERIC` columns returned as strings by the `pg` driver are cast with `Number()` in service mappers before serialisation.

## Deliberate Omissions

- **Rate limiting** — no `express-rate-limit` or equivalent. First reliability addition in production.
- **Refresh-token rotation** — 8-hour JWT lifetime is a v1 trade-off. Production would use short-lived access tokens with server-side rotating refresh tokens.
- **Live market price feeds** — `instruments.last_price` is a static seed value.
- **Migration rollback / down scripts** — `scripts/migrate.ts` applies migrations forward only. A rollback procedure needs documenting.
- **HTTPS / TLS** — plain HTTP on localhost; production would terminate TLS at a reverse proxy.
- **Connection pool tuning** — `pg` pool defaults (`max: 10`) are hard-coded; no env vars exposed for tuning.

## Known Limitations

- **Rate limiting** — no request-rate cap in place; first reliability hardening item for production.
- **Migration rollback** — `scripts/migrate.ts` applies migrations forward only; no down-migration scripts or documented rollback procedure.
- **Connection pool tuning** — `pg` pool size defaults (`max: 10`) are hard-coded; not configurable via env.
