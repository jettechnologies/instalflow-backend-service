# 🧠 Instalflow: Ledger-First Fintech PRD

> This document is the **Source of Truth** and **Execution Blueprint** for the Instalflow Backend. 
> **Architectural Motto**: The Ledger is the ultimate source of truth. Paystack is a payment rail; the database is the financial truth.

---

## 0. 🎯 Product Pillars — Do Not Dilute

InstalFlow exists to manage **installment financing**, pay **marketer commissions** accurately, and deliver **installment reminders** before money is late. These three are the solid deliverables of the product. Every other domain (Identity, Catalog, KYC, Ledger, and any future Billing/Developer-API/Capital work) exists to *serve* those three — see [`DOMAIN_MODEL.md`](./DOMAIN_MODEL.md) for the full bounded-context breakdown, ownership boundaries, and event flow. Read it before adding a new domain or service.

---

## 1. 🏗️ CORE ARCHITECTURE & STACK

### Technology Stack
- **Runtime**: Node.js (ESM)
- **Framework**: Express `^5.1.0` (Native promise propagation)
- **ORM**: Prisma `^7.0` (using `PrismaPg` adapter with `pg.Pool` SSL configurations for Neon Serverless DB in production)
- **Validation**: Zod (Strict schema enforcement)
- **Auth**: JWT (Access) + DB-backed UserSessions (Refresh) + `express-session` (CSRF backing)
- **Docs**: Swagger UI (Decoupled YAML strategy)

### Standardized Directory Structure

Three independent runtime processes share one `src/` tree (see `package.json` scripts — `dev`, `dev:worker`, `dev:scheduler`):

```text
src/
├── api/                 # Process 1: HTTP server (controllers/, middlewares/, routes/)
├── job-workers/          # Process 2: BullMQ Worker consumers
├── schedulers/            # Process 3: cron producers (enqueue onto the same queues)
├── core/                  # domain logic — services/, events/, channels/, notifications/
├── infrastructure/         # config/, prisma/, redis/, queues/, mail/, logger/
└── shared/                  # schemas/ (Zod), types/, utils/, job-workers/ (shared cron+queue logic)
```

Full file-level map (every route/service/worker/queue) lives in the `instalflow-codebase-map` skill's `reference.md` — use it for "where is X" lookups instead of re-deriving structure each time.

---

## 2. 🏗️ HIGH-LEVEL ARCHITECTURE

```txt
[ Client / Dashboard / API ]
            ↓
        API Layer
            ↓
      Domain Services
            ↓
     Event Dispatcher (Internal)
            ↓
        Queue Layer (BullMQ / Redis)
            ↓
         Workers
            ↓
     Ledger + Database (PostgreSQL)
            ↓
 External Systems (Paystack, Twilio, Resend)
```

---

## 3. 🛡️ THE "GOLDEN RULES" (ARCHITECTURAL GUARDRAILS)

### 2.1 The Dual-ID Pattern
- **Internal**: `BigInt` auto-increment for database performance (Clustering).
- **External**: `UUID` for public-facing API references.
- **Rule**: Never expose `BigInt` IDs. Use a global `toJSON` Prisma Client Extension to automatically strip the internal `id` during JSON serialization. **Do not use `compute: () => undefined`**, as this nullifies the ID in the execution memory and breaks internal Prisma relations (e.g., `JournalEntry` creation).
- **Direct Connect**: Use `connect: { someId: uuid }` directly. Never query for an internal ID just to perform an insertion.

### 2.2 Express 5 & Clean Controllers
- **No Try/Catch**: Take advantage of Express 5's native rejection propagation. Errors bubble to `errorHandler.ts` automatically.
- **Zod Coercion**: Use `z.coerce` for query/params and `z.preprocess` for complex `multipart/form-data`.
- **Logic Isolation**: Controllers only parse data and return responses via `ApiResponse`. All business logic lives in `services/`.

### 2.3 Safe Third-Party IO (The Compensation Pattern)
1. **Validate**: Check DB for constraints first.
2. **Execute IO**: Perform External API call (Cloudinary, SMS, etc.).
3. **Persist**: Execute Prisma Transaction.
4. **Compensate**: If Prisma fails, catch and **undo** the Third-Party IO (e.g., delete the uploaded image).

### 2.4 Token Lifecycle
- **Access Token**: Short-lived (15-30m).
- **Refresh Token**: Long-lived (7d), stored in `UserSession` table.
- **Revocation**: Sessions must be instantly revocable by updating `revoked: true` in the DB.

---

## 4. 🧩 CORE DOMAIN MODULES

Tier reflects product priority per [§0](#0--product-pillars--do-not-dilute), not build order — **CORE** modules are the deliverables users pay for; **SUPPORTING** modules exist to make CORE correct and safe. See [`DOMAIN_MODEL.md`](./DOMAIN_MODEL.md) for ownership boundaries and event flow between them.

| Module | Tier | Responsibility |
| :--- | :--- | :--- |
| **Installment** | 🔵 CORE | Schedule generation, payment states, aging/overdue tracking. |
| **Commission** | 🔵 CORE | Calculation engine, marketer tiers, payout records, FIFO allocation. |
| **Notification** | 🔵 CORE | Reminder cadence/escalation, Email today — SMS/WhatsApp not yet wired despite being an aspirational stack item below. |
| **Ledger** | 🟣 SUPPORTING | **Financial Core.** Immutable, append-only double-entry accounting backing every CORE money movement. |
| **Application (KYC)** | 🟣 SUPPORTING | Onboarding, document submission, dual-approval lifecycle — the gate before Installment can activate a contract. |
| **Auth & Identity** | 🟣 SUPPORTING | Sessions, JWT, RBAC (SUPER_ADMIN, ADMIN, COMPANY, MARKETER, CUSTOMER). |
| **Company (Tenant)** | 🟣 SUPPORTING | Multi-tenancy, plan management, custom configs. |
| **User** | 🟣 SUPPORTING | Profile management, role-based onboarding. |
| **Product** | 🟣 SUPPORTING | Catalog, pricing, installment rule binding. |
| **Referral** | 🟣 SUPPORTING | Link generation, marketer attribution, binding logic. |
| **Payment** | 🟣 SUPPORTING | Gateway integration, signature verification, idempotency — feeds Installment and Commission. |
| **Automation** | 🟣 SUPPORTING | Cron jobs (due reminders, escalation, aging) driving the Notification module. |

---

## 5. 🧮 FINANCIAL CORE (THE LEDGER SYSTEM)

Every financial event must be verified, recorded atomically, and be replayable.

### 4.1 Ledger Account Model (Company Level)
| Account Name        | Type      | Purpose                        |
| ------------------- | --------- | ------------------------------ |
| Paystack_Clearing   | ASSET     | Money received but not settled |
| Bank_Settled        | ASSET     | Actual settled funds           |
| Customer_Receivable | ASSET     | What customers owe             |
| Commission_Payable  | LIABILITY | What you owe marketers         |
| Payouts_In_Transit  | ASSET     | Pending transfers              |
| Revenue             | REVENUE   | Company earnings               |
| Platform_Revenue    | REVENUE   | Your SaaS (Instalflow) earnings|

### 4.2 Data Integrity Rules
- **Derivation**: Never store "balance" columns as the source of truth. Derive balances by summing the Ledger.
- **Webhook Idempotency**: Store all incoming Paystack webhooks in a `WebhookEvent` table. Process once via `idempotencyKey`.
- **Immutability**: Ledger entries are append-only. To correct an error, create a reversing entry (Debit/Credit).

---

## 6. 🔁 EVENT-DRIVEN QUEUE SYSTEM

Everything that involves money or slow IO moves through **BullMQ**.

### 5.1 The Core Event Loop
1.  **Webhook Trigger**: `payment.received` event emitted.
2.  **Worker Payment Verification**: 
    -   Verify via Paystack API (Amount, Currency, Status).
    -   Atomic Ledger Move: `DEBIT Paystack_Clearing` / `CREDIT Customer_Receivable`.
3.  **Downstream Triggers**:
    -   `commission.accrued` -> Calculate rate -> Update Ledger (`CREDIT Commission_Payable`).
    -   `installment.updated` -> Move installment state to PAID.
    -   `notification.triggered` -> Send Email/SMS.

### 5.2 Retry & Failure Strategy
- **Max Retries**: 5 (Exponential backoff 2^n * 1 min).
- **Terminal States**: LOG failure but never leave the Ledger in an unbalanced state.

---

## 7. 💰 COMMISSION & PAYOUT SYSTEM

### 6.1 Lifecycle
1.  **Request**: `POST /payouts` -> Check `Commission_Payable` balance.
2.  **Ledger Move**: `DEBIT Commission_Payable` / `CREDIT Payouts_In_Transit`.
3.  **Execution**: `payout.initiated` job -> Call Paystack `/transfer` -> Store `transfer_code`.
4.  **Completion**: `transfer.success` -> Clear `Payouts_In_Transit`.

---

## 8. 🔍 RECONCILIATION ENGINE (Daily CRON)
1.  **Paystack Sync**: Fetch daily settlements.
2.  **Validation**: `Paystack_Clearing` vs `Bank_Settled`.
3.  **Journal Finish**: `DEBIT Bank_Settled` / `CREDIT Paystack_Clearing`.

---

## 9. 🔥 FINAL ENGINEERING RULES (PRINCIPLES)

1.  **Never Trust Client**: Only webhooks and server-to-server verification trigger money moves.
2.  **Ledger-First**: No financial action without a double-entry journal record.
3.  **Atomic Persistence**: Use Prisma `$transaction` for every ledger mutation.
4.  **Async Priority**: Controllers return `Accepted (202)` fast; workers do the heavy lifting.
5.  **Core-First**: Installment scheduling correctness, commission accuracy, and reminder delivery are the product. No new domain (Billing, Developer API, Capital) ships ahead of, or at the expense of, these three — see [§0](#0--product-pillars--do-not-dilute).
6.  **Event-Driven Side Effects, Atomic Financial State**: once a payment/installment/ledger write commits inside its `$transaction`, everything downstream (commission accrual, reminders, analytics, future webhooks) should react to an emitted event rather than being called inline — but the financial write itself never gets split across async steps. See `DOMAIN_MODEL.md` §1 for the concrete boundary.

---

## 10. 🚀 ROADMAP & PHASED IMPLEMENTATION

### Delivered (Phases 1–5)
1.  **Phase 1**: Auth, Infrastructure, Company/User Context.
2.  **Phase 2**: Product Catalog + Installment Generation Logic.
3.  **Phase 3 (Fintech Core)**: Webhooks + Ledger Module + BullMQ Setup.
4.  **Phase 4 (Economics)**: Commission Engine + Payout Retention logic.
5.  **Phase 5 (Ops)**: Reconciliation Engine + Daily Audits.

### Stage 1 (Active) — Merchant SaaS Depth, Around the Core

Do not add new bounded contexts here — every item below extends Installment, Commission, or Notification (see `DOMAIN_MODEL.md`), or makes the dashboard around them exceptional:

- ✅ **Merchant settlement** — `MERCHANT_PAYABLE`/`MERCHANT_SETTLEMENT_EXPENSE` ledger accounts + fully automatic `MerchantSettlementRequest` pipeline (generate → auto-approve → auto-queue transfer → Paystack → verified webhook). COMPANY is read-only; SUPER_ADMIN has audit trail + retry-on-failure. See `DOMAIN_MODEL.md` §3. Migration pending (`add_automatic_merchant_settlement`) — not yet applied to the dev DB.
- ✅ **Marketer-free / company-direct checkout** — `OnboardingSession.marketerId` is now nullable; `KycService.registerDirect()` + `Company.publicSignupCode` enable customer registration with no marketer, and an ADMIN using `registerDirect` becomes the commission-eligible referrer. See `DOMAIN_MODEL.md` §1. Migration pending (`make_onboarding_session_marketer_optional`).
- ✅ **Commission eligibility generalized to ADMIN** — `COMMISSION_ELIGIBLE_ROLES` role-list replaces the hardcoded `Role.MARKETER` check throughout the commission flow. See `DOMAIN_MODEL.md` §2.
- ⏳ **Notification templates for the new settlement/subscription events** — 11 new `DomainEvent`s are correctly emitted but not yet fanned out to branded email/in-app notifications; flagged as the natural next increment in `DOMAIN_MODEL.md`'s "Known gaps" section.
- Collections workspace extending `FinancingContract`/`Installment` (promise-to-pay tracking, follow-up assignment) for the `OVERDUE` → `DEFAULTED` gap — not yet built.
- Per-company reminder configuration (channel + cadence) — cadence is currently hardcoded in the scheduler, still true for both installment and (new) subscription renewal reminders.
- SMS/WhatsApp notification channel — closes the gap between this document's aspirational Twilio mention and what's actually wired (email only today) — not yet built.
- Customer timeline, reports/export, branding — dashboard polish that makes the core deliverables visible and trustworthy to a non-technical merchant — not yet built.

### Stage 2 (Partially shipped) — Billing Domain

Company-subscription health as its own bounded context — see `DOMAIN_MODEL.md` §10. ✅ Renewal reminder ladder (7-day/3-day/expires-today), `GRACE_PERIOD`/`RESTRICTED` states, click-to-renew (`POST /subscription/renew`) are shipped (migration pending: `subscription_grace_period_and_renewal`). ⏳ `Invoice`, `Coupon`, and dunning beyond the reminder ladder are not built. Explicitly **not** the same domain as installment reminders even though both are "reminders" — different audience, different stakes, kept separately ownable (they now share only the mechanical `dayWindow()`/`ensureReminderSent()` utility, not business logic).

### Stage 3+ (Not started, gated behind demonstrated merchant demand)

Developer API (`ApiKey`, outbound webhooks, sandbox mode) and InstalFlow Capital (funding-partner layer, underwriting/risk model) — see `DOMAIN_MODEL.md` §10–11. Per the product direction: these get built when merchants using Stage 1 ask for them, not in parallel with Stage 1.
---

## 11. 🔒 SECURITY CHECKLIST
- [ ] Webhook signature verification implemented.
- [ ] Role-based access control (RBAC) enforced on every route.
- [ ] All inputs validated via Zod.
- [ ] CSRF middleware active for state-changing requests.
- [ ] Rate limiting applied to auth/sensitive endpoints.
- [ ] Sensitive data (BigInt IDs, raw passwords) never exposed.
