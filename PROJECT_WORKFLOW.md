# 🧠 Instalflow: Project Workflow & Architectural Guardrails

> This document is the **Source of Truth** for the Instalflow Backend Service. It combines the Technical PRD with the Architectural Scaffolding Guide to ensure a consistent, secure, and scalable development flow.

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
├── config/         # App initializers (express, prisma, cloudinary, swagger)
├── controllers/    # Request handlers (Payload parsing -> Service call)
├── libs/           # Shared utilities (AppError, ApiResponse, Logger)
├── middlewares/    # Security, Auth Guards, Global Error Handler
├── routes/         # Endpoint definitions
├── schema/         # Zod validation schemas
├── services/       # Core business logic & DB transactions
├── utils/          # Pure helper functions
├── docs/           # Swagger YAML definitions
└── index.ts        # Bootstrap
```

---

## 2. 🛡️ THE "GOLDEN RULES" (ARCHITECTURAL GUARDRAILS)

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

## 3. 🧩 CORE DOMAIN MODULES

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

## 4. 🔄 EVENT-DRIVEN & ASYNC SYSTEM

### Internal Event Bus
Events are the glue between modules.
- **MVP**: Node EventEmitter.
- **Scale**: BullMQ + Redis.

### Core Flows
- `payment.success` → Update installment → Emit `commission.created` → Update Ledger → Trigger Notification.
- `installment.overdue` → Notify Marketer → (if 5 days) Notify Admin → (if 7 days) Mark Defaulted & Freeze Commission.

---

## 5. 🧮 FINANCIAL INTEGRITY (LEDGER)

The Ledger is immutable. Never update financial balances; only append credit/debit entries.
- **Transactions Table**: `type (debit/credit)`, `amount`, `referenceId`.
- **Mappings**: Customer Account, Company Revenue, Marketer Commission.

---

## 6. 🚀 DEVELOPMENT ROADMAP (PRIORITY ORDER)

1.  **Foundation**: Auth + User Management (Completed ✅)
2.  **Infrastructure**: Cloudinary, Swagger, CI Workflow (Completed ✅)
3.  **Commerce**: Products + Installment Schedule Logic
4.  **Transaction**: Payments + Gateway Webhooks
5.  **Economics**: Commission Calculation + Payouts
6.  **Accounting**: Ledger System Integration
7.  **Automation**: Reminders & Escalation Engine
8.  **Communication**: Notification Templates & SMS

---

## 7. 🔒 SECURITY CHECKLIST
- [ ] Webhook signature verification implemented.
- [ ] Role-based access control (RBAC) enforced on every route.
- [ ] All inputs validated via Zod.
- [ ] CSRF middleware active for state-changing requests.
- [ ] Rate limiting applied to auth/sensitive endpoints.
- [ ] Sensitive data (BigInt IDs, raw passwords) never exposed.
