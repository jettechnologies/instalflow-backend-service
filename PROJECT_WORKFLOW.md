# 🧠 Instalflow: Ledger-First Fintech PRD

> This document is the **Source of Truth** and **Execution Blueprint** for the Instalflow Backend. 
> **Architectural Motto**: The Ledger is the ultimate source of truth. Paystack is a payment rail; the database is the financial truth.

---

## 1. 🏗️ CORE ARCHITECTURE & STACK

### Technology Stack
- **Runtime**: Node.js (ESM)
- **Framework**: Express `^5.1.0` (Native promise propagation)
- **ORM**: Prisma `^7.0` (with custom Postgres Driver Adapters)
- **Validation**: Zod (Strict schema enforcement)
- **Auth**: JWT (Access) + DB-backed UserSessions (Refresh) + `express-session` (CSRF backing)
- **Docs**: Swagger UI (Decoupled YAML strategy)

### Standardized Directory Structure
```text
src/
├── config/         # App initializers (BullMQ, Redis, Prisma, Swagger)
├── controllers/    # Request handlers (Payload parsing -> Service call)
├── libs/           # Shared utilities (AppError, ApiResponse, LedgerLogic)
├── middlewares/    # Security, Auth Guards, Global Error Handler
├── routes/         # Endpoint definitions
├── schema/         # Zod validation schemas
├── services/       # Core business logic & Atomic Transactions
├── workers/        # BullMQ / Queue Job Consumers
├── queue/          # Job producers & Queue definitions
├── docs/           # Swagger YAML definitions
└── index.ts        # Bootstrap
```

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
- **Rule**: Never expose `BigInt` IDs. Use the Prisma Client Extension to automatically strip them from query results globally.
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

| Module | Responsibility |
| :--- | :--- |
| **Auth & Identity** | Sessions, JWT, RBAC (SUPER_ADMIN, ADMIN, COMPANY, MARKETER, CUSTOMER). |
| **Company (Tenant)** | Multi-tenancy, plan management, custom configs. |
| **User** | Profile management, role-based onboarding. |
| **Product** | Catalog, pricing, installment rule binding. |
| **Referral** | Link generation, marketer attribution, binding logic. |
| **Application (KYC)** | onboarding, document submission, approval lifecycle. |
| **Installment** | Schedule generation, payment states, aging/overdue tracking. |
| **Payment** | Gateway integration, signature verification, idempotency. |
| **Commission** | Calculation engine, marketer tiers, payout records. |
| **Ledger** | **Financial Core.** Immutable, append-only double-entry accounting. |
| **Notification** | SMS (Twilio), Email (Resend/Cloudinary Templates). |
| **Automation** | Cron jobs (due reminders, escalation, aging). |

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

---

## 10. 🚀 ROADMAP & PHASED IMPLEMENTATION

1.  **Phase 1 (Active)**: Auth, Infrastructure, Company/User Context.
2.  **Phase 2 (Next)**: Product Catalog + Installment Generation Logic.
3.  **Phase 3 (Fintech Core)**: Webhooks + Ledger Module + BullMQ Setup.
4.  **Phase 4 (Economics)**: Commission Engine + Payout Retention logic.
5.  **Phase 5 (Ops)**: Reconciliation Engine + Daily Audits.
---

## 11. 🔒 SECURITY CHECKLIST
- [ ] Webhook signature verification implemented.
- [ ] Role-based access control (RBAC) enforced on every route.
- [ ] All inputs validated via Zod.
- [ ] CSRF middleware active for state-changing requests.
- [ ] Rate limiting applied to auth/sensitive endpoints.
- [ ] Sensitive data (BigInt IDs, raw passwords) never exposed.
