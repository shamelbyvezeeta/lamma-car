# Database Schema

Source of truth: `migrations/001_initial_schema.sql` (PostgreSQL 14+, tested on 16). Apply with `npm run migrate`; the runner records each file with a SHA-256 checksum in `schema_migrations` and refuses to run if an applied migration was edited. **Never edit an applied migration — add `002_…sql`.**

## Relationships
```
app_users ─┬─< customers ─< vehicles ─< qr_codes >─ qr_batches
           │        │            │          │
           │        ├─< consent_records     └─< qr_status_history
           │        └─< sales >─ vehicles, qr_codes, qr_batches, sales_channels
           ├─< audit_logs
           └─< contact_requests (→ qr_codes, customers, vehicles)
sheet_layouts · system_settings · http_sessions · schema_migrations
```

## Tables
| Table | Purpose | Key constraints |
|---|---|---|
| `app_users` | Staff accounts | `email` unique (citext); role enum; lockout fields; `must_change_password` |
| `http_sessions` | Server-side sessions | expiry index |
| `customers` | Owners | `customer_ref` C-000001 (sequence); `mobile` E.164 check + **unique**; `phone_visibility` enum default **`not_set`** (treated as private); `is_test_data` flag |
| `consent_records` | Every privacy choice, who/when/how/evidence | **append-only** trigger |
| `vehicles` | Cars | `vehicle_ref` V-000001; year 1950–2100; category check list; **owner immutable** trigger; `UNIQUE (id, customer_id)` enables composite FKs |
| `qr_batches` | Print runs | `batch_ref` B-YYYY-NNNN; name unique (case-insensitive); quantity 1–5000; `request_token` unique (idempotency) |
| `qr_codes` | Sticker identifiers | `public_code` 10-char Crockford Base32 **unique**; `serial_no` unique; composite FK `(vehicle_id, customer_id) → vehicles`; checks that unassigned states have no owner and live states have one; **one live code per vehicle** (partial unique index); **state machine + no-reuse + immutable identity** trigger; **no delete** trigger |
| `qr_status_history` | Every status transition | append-only |
| `sales_channels` | Reference data | seeded: direct, showroom, event, partner, online |
| `sales` | Sticker sales | `sale_ref` S-000001; amount 0–10,000,000 numeric(14,2); currency ISO-3; composite FK to vehicle/customer; trigger checks QR belongs to same customer/vehicle and **derives `batch_id`**; `request_token` unique |
| `contact_requests` | Visitor messages (relay) | phone E.164; message 2–600 chars; IP stored only as HMAC |
| `sheet_layouts` | Configurable print sheets | one default (partial unique index) |
| `system_settings` | Key/value (JSONB) | key pattern check; unknown keys rejected by the service |
| `audit_logs` | Activity log | append-only; indexed by time, entity, actor |

## QR state machine (enforced by `trg_qr_guard`)
```
generated ──release──▶ available ──assign──▶ assigned ──activate──▶ active ⇄ suspended
    │                      │                    │                    │          │
    └──────────────────────┴────────────────────┴──── deactivate ────┴──────────┘──▶ deactivated (terminal)
```
Also enforced: `public_code`, `serial_no`, `batch_id` never change; once `customer_id`/`vehicle_id` are set they never change (no reuse for another customer, even after deactivation).

## Public read model
`public_qr_card(code)` — `SECURITY DEFINER`, `STABLE`. Returns status plus whitelisted vehicle fields; every field is `NULL` unless the code is `active`; extended fields only for `listed` vehicles and only when the per-vehicle `show_*` flags allow; `public_phone` only when `phone_visibility = 'public'` and the customer is `active`. Returns no IDs, names, e-mails or notes. Optional hardening: create a login role that may only `EXECUTE` this function and run the public route with it (see DEPLOYMENT_GUIDE).

## Indexes
Customers by mobile (unique), lower(name), status; vehicles by customer and make/model; codes by (batch, status), status, customer; sales by date, status, customer, batch; audit by time, entity, actor; sessions by expiry.

## Transactions & duplicate protection
- Batch generation inserts all codes in one transaction under an advisory lock (sequential references); retries on code collision via `ON CONFLICT DO NOTHING`.
- Batch and sale forms carry a `request_token` UUID: a double submit returns the existing record.
- Assign/activate/suspend/deactivate lock the code row (`FOR UPDATE`) and write status history + audit in the same transaction.

## Execution status
Migrations were **executed** against PostgreSQL 16.x in the build environment (dev database and, on every test run, a freshly recreated test database). They have **not** been executed against any production database (none was provided).
