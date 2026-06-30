# Instalflow Backend Service — Architecture & Logic Documentation

## 1. Project Overview

**Instalflow** is a fintech-grade installment financing platform (Buy Now, Pay Later) built with **TypeScript**, **Express.js**, **Prisma ORM**, and **BullMQ**. It enables customers to purchase products via installment plans funded by platform companies, while marketers earn commissions on successful customer payments.

---

## 2. Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Runtime** | Node.js + TypeScript | API server, workers, schedulers |
| **Framework** | Express.js v5 | HTTP server |
| **ORM** | Prisma 7 + PostgreSQL (via Neon/pg) | Database access, migrations |
| **Queue** | BullMQ + Redis | Async job processing |
| **Payments** | Paystack API | Payment gateways, transfers |
| **File Storage** | Cloudinary | KYC document storage |
| **Email** | Brevo + Cloudflare Worker | Transactional email delivery |
| **Validation** | Zod | Runtime schema validation |
| **Observability** | OpenTelemetry | Logging, tracing |
| **Auth** | JWT (Access + Refresh) + bcrypt | Stateless token auth with session revocation |
| **Docs** | Swagger/OpenAPI | API documentation |

---

## 3. System Architecture

The backend runs **three separate Node.js processes**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    INSTALFLOW BACKEND                            │
├──────────────┬──────────────────────────┬───────────────────────┤
│  API Server  │      Job Workers         │      Schedulers       │
│  src/api/    │   src/job-workers/       │   src/schedulers/     │
│              │                          │                       │
│ • Express    │ • Payment Worker         │ • KYC Retention       │
│ • Controllers│   (processes payments)   │ • Payment Reminders   │
│ • Routes     │ • Onboarding Worker      │ • Ledger Reconciliation│
│ • Webhooks   │ • Transfer Worker        │   (daily 02:00)       │
│              │ • KYC Retention Worker   │                       │
│              │ • Payment Reminder Worker│                       │
│              │ • Ledger Reconciler      │                       │
└──────────────┴──────────────────────────┴───────────────────────┘
         │               │                      │
         └───────────────┴──────────────────────┘
                         │
              ┌──────────┴──────────┐
              │   Infrastructure    │
              │ • PostgreSQL (Prisma)│
              │ • Redis (BullMQ)    │
              │ • Cloudinary         │
              │ • Brevo / Worker     │
              └─────────────────────┘
```

---

## 4. Data Model

### 4.1 Core Entities

```
┌──────────────────────────────────────────────────────────────────┐
│  Company (PLAN)                                                   │
│    ├── User[COMPANY] (owner)                                      │
│    ├── User[ADMIN]*                                               │
│    ├── User[MARKETER]*                                            │
│    ├── User[CUSTOMER]*                                            │
│    ├── Product*                                                   │
│    │     ├── Category                                             │
│    │     ├── ProductVariant                                       │
│    │     │     └── FinancingContract                               │
│    │     │           └── Installment*                             │
│    │     │                 └── Payment*                           │
│    │     │                       ├── Commission*                  │
│    │     │                       └── CommissionAllocation*        │
│    │     │                             └── CommissionPayoutRequest  │
│    │     ├── ProductInstallmentPlan                                │
│    │     └── ProductImage                                          │
│    ├── SubscriptionPlan                                           │
│    ├── CompanySubscription                                        │
│    ├── LedgerAccount                                              │
│    └── ApprovalRequest*                                           │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 Enumerations

| Enum | Values | Purpose |
|------|--------|---------|
| `Role` | SUPER_ADMIN, ADMIN, COMPANY, MARKETER, CUSTOMER | RBAC |
| `FinancingStatus` | PENDING_ACTIVATION, ACTIVE, COMPLETED, DEFAULTED, CANCELLED, REJECTED, RESTRUCTURED, WRITTEN_OFF | Contract lifecycle |
| `InstallmentStatus` | PENDING, DUE, OVERDUE, DEFAULTED, PAID | Payment tracking |
| `PaymentStatus` | PENDING, SUCCESS, FAILED | Payment tracking |
| `CommissionStatus` | ACTIVE, PARTIALLY_RESERVED, RESERVED, PAID | Commission state machine |
| `CommissionPayoutStatus` | PENDING_ADMIN_APPROVAL, PENDING_COMPANY_APPROVAL, APPROVED, REJECTED, TRANSFER_INITIATED, PAID, TRANSFER_FAILED, TRANSFER_REVERSED | Payout lifecycle |
| `OnboardingStatus` | PENDING, PAYMENT_INITIALIZED, PAID, COMPLETED, FAILED | Company onboarding |
| `InternalNotificationStatus` | UNREAD, READ, ARCHIVED | Notification state |

---

## 5. Domain Logic

### 5.1 Authentication & Authorization

**Files**: `src/core/services/auth.service.ts`, `src/api/middlewares/auth.guard.ts`

- JWT dual-token strategy: **Access Token** (short-lived) + **Refresh Token** (7-day)
- `UserSession` model stores hashed refresh tokens in DB → enables revocation (stateful sessions)
- Login validates bcrypt password, creates session, returns both tokens
- Refresh flow validates token against stored session (checks `revoked` and `expiresAt`)
- Logout revokes specific session or all sessions
- Password reset uses 6-digit OTP with bcrypt hashing, 15-min cooldown, max 3 requests per 15 min
- Force-password-change flag for staff accounts created by admins
- RBAC enforced via `requireRole(['COMPANY', 'SUPER_ADMIN'])` middleware
- CSRF protection via double-submit cookie pattern

### 5.2 Company Onboarding

**Files**: `src/core/services/auth.service.ts`, `src/job-workers/onboarding.worker.ts`, `src/infrastructure/queues/onboarding.queue.ts`

1. `startOnboarding()` creates an `OnboardingIntent` record
2. Calls Paystack to initialize payment for the selected subscription plan
3. On `charge.success` webhook, job is queued to `onboardingQueue`
4. **Onboarding Worker**:
   - Verifies payment via Paystack
   - Creates `Company` + `User` (COMPANY role)
   - Creates `CompanySubscription` with start/end dates based on plan interval
   - Records double-entry ledger transaction (PAYSTACK_CLEARING → PLATFORM_REVENUE)
   - Emits `COMPANY_ONBOARDED` domain event for email notification

### 5.3 Subscription Management

**Files**: `src/core/services/subscription.service.ts`, `src/core/services/superadmin.service.ts`

- `SuperAdminService`: CRUD for `SubscriptionPlan` (create, update, toggle active, delete)
- `SubscriptionService`:
  - List active public plans
  - Initialize subscription payment (onsite for existing companies)
  - `verifySubscription()` — `charge.success` fallback that activates subscription, updates company plan, records ledger entry
  - Plans support WEEKLY/MONTHLY/YEARLY intervals with optional discount pricing

### 5.4 Product & Category Management

**Files**: `src/core/services/product.service.ts`, `src/core/services/category.service.ts`

Companies manage product catalogs:
- Split products into categories (each with unique slug)
- Products support variants (size, color, stock, SKU):
  - Commission rate per product used for marketer earnings calculation
  - Product images (primary flag, sort order, Cloudinary URLs)
- Products can be active/inactive

### 5.5 KYC Application Flow (Maker-Checker)

**Files**: `src/core/services/kyc.service.ts`, `src/job-workers/kyc-retention.worker.ts`

This is the **core business flow** of the platform:

1. **Registration via Referral**: Customer signs up using a marketer's referral code
   - `KycService.registerViaReferral()` creates customer, logs referral, issues onboarding token
2. **Application Submission**: Customer uploads bank statement PDF
   - Validates file type (PDF only), size (≤10MB)
   - Uploads to Cloudinary
   - Computes SHA-256 hash for audit integrity
   - Creates `KycApplication` + `FinancingContract` in a DB transaction
   - Creates `KycDocumentAsset` with **scheduled deletion** (15 days)
   - Creates immutable `KycAuditTrail` entry
   - Fires app-signed event + internal notification to marketer + admin
3. **Dual Approval (Maker-Checker)**:
   - **Marketer approval**: Confirms the customer belongs to their referral scope
   - **Admin approval**: Confirms the marketer is under their hierarchy
   - Both must sign → status becomes `APPROVED`
4. **On Full Approval**:
   - `InstallmentService.generateInstallmentSchedule()` creates amortized schedule
   - Contract status → `ACTIVE`
   - KYC document assets are **immediately scheduled for deletion** (NDPR/CBN compliance)
   - Customer and marketer are notified

**KYC Retention Worker** (daily cron):
- Queries `KycDocumentAsset` where `scheduledDeletionAt <= now()`
- Permanently purges the physical files from Cloudinary (GDPR-like compliance)

### 5.6 Installment Schedule & Payments

**Files**: `src/core/services/installment.service.ts`, `src/job-workers/payment.worker.ts`

**Schedule Generation**:
- Divides total financed amount equally across months
- Remainder cents are pushed to the last installment
- Due dates are monthly from the first payment date (first payment = +3 days from activation)

**Payment Flow**:
1. Customer triggers `initializeInstallmentPayment()` → calls Paystack `transaction/initialize`
2. Paystack redirects customer to payment page
3. On success, Paystack sends `charge.success` webhook
4. **Payment Worker** processes the payment:
   - Idempotent: checks `Payment` with same `idempotencyKey`
   - Updates installment to `PAID`
   - Calculates commission based on product's `commissionRate`
   - Creates `Commission` record for the marketer
   - Records **double-entry ledger**:
     ```
     PAYSTACK_CLEARING     (ASSET)    DEBIT  amount
     CUSTOMER_RECEIVABLE   (ASSET)    CREDIT amount
     COMMISSION_EXPENSE    (EXPENSE)  DEBIT  commission (if any)
     COMMISSION_PAYABLE    (LIABILITY) CREDIT commission (if any)
     ```
   - If all installments paid → contract status → `COMPLETED`
   - Fires `INSTALLMENT_PAID` + `COMMISSION_ACCRUED` notification events

### 5.7 Commission & Payout System

**Files**: `src/core/services/commission.service.ts`, `src/job-workers/transfer.worker.ts`

**Commission Accrual**:
- Triggered automatically on every successful payment
- `amount = installment.amount × (product.commissionRate / 100)`
- Status: `ACTIVE` initially, transitions to `PARTIALLY_RESERVED` or `RESERVED` as allocations are made

**Requesting a Payout** (`requestPayout()`):
- Marketer submits a payout request
- System validates sufficient available balance
- **Greedy FIFO allocation**: oldest commissions are locked first (FIFO order)
  - Each commission gets `reservedAmount` incremented
  - Status derives dynamically: `0 → ACTIVE | partially → PARTIALLY_RESERVED | fully → RESERVED`
- Creates `CommissionPayoutRequest` + `CommissionAllocation[]` in a transaction

**Approval Chain** (2-step):
1. **Admin** → `PENDING_COMPANY_APPROVAL`
2. **Company** → `APPROVED` (if creator is COMPANY, skips step 1)

**Transfer Initiation** (`initiateTransfer()`):
- Only `APPROVED`, `TRANSFER_FAILED`, or `TRANSFER_REVERSED` payouts can be initiated
- Resolves marketer's primary bank account via Paystack
- Enqueues `transferQueue` job
- Sets status → `TRANSFER_INITIATED`
- Creates ledger entry:
  ```
  COMMISSION_PAYABLE  (LIABILITY)  DEBIT  amount
  PAYOUTS_IN_TRANSIT  (ASSET)      CREDIT amount
  ```

**Transfer Worker**:
- Creates Paystack transfer recipient (if not exists)
- Calls Paystack `transfer` API
- On success → DB records `transferCode`, waits for webhook

**Webhook Handlers** (`handleChargeSuccess`, `handleTransferSuccess`, `handleTransferFailed`, `handleTransferReversed`):

| Webhook Event | Action |
|---------------|--------|
| `charge.success` (onboarding) | Queue onboarding worker |
| `charge.success` (installment) | Queue payment worker |
| `charge.success` (subscription) | Verify + activate |
| `transfer.success` | Mark `PAID`, release allocations, ledger: PAYOUTS_IN_TRANSIT → BANK_SETTLED |
| `transfer.failed` | Mark `TRANSFER_FAILED`, restore allocations/commissions, ledger: PAYOUTS_IN_TRANSIT → COMMISSION_PAYABLE |
| `transfer.reversed` | Mark `TRANSFER_REVERSED`, restore allocations/commissions, ledger: BANK_SETTLED → PAYOUTS_IN_TRANSIT / COMMISSION_PAYABLE |

**Bulk Transfer**: `CommissionService.initiateBulkTransfer()` — validates multiple payouts, enqueues them individually, returns per-item results.

### 5.8 Ledger & Accounting

**File**: `src/core/services/ledger.service.ts`

- **Double-entry bookkeeping**: all financial operations create balanced entries (total debits == total credits)
- **Account Types**: ASSET, LIABILITY, REVENUE, EXPENSE, EQUITY
- **Normal balance rules**:
  - ASSET/EXPENSE: increases with debits, decreases with credits
  - LIABILITY/EQUITY/REVENUE: increases with credits, decreases with debits
- Auto-creates `LedgerAccount` on first use if account name doesn't exist
- Ledger reference is idempotent (upsert on `reference` field)

**Ledger Reconciliation** (daily 02:00):
- Computes canonical balance from journal entries vs stored balance
- Auto-corrects any drift
- Caches results in Redis (TTL 25 hours)

### 5.9 Customer Management

**File**: `src/core/services/customer-management.service.ts`

- **Role-scoped querying**:
  - `MARKETER`: sees only customers they referred
  - `ADMIN`: sees customers from marketers they created
  - `COMPANY`/`SUPER_ADMIN`: sees all customers
  - `CUSTOMER`: sees only themselves
- Shows financed product progress, installment schedules, payment history
- Corporate hierarchy view: `COMPANY` → `ADMIN` → `MARKETER` → `CUSTOMER` tree

### 5.10 User Management & Approval Workflows

**File**: `src/core/services/user-management.service.ts`

- Admin/Marketer lifecycle:
  - Creation with `forcePasswordChange` flag
  - Temporary password prefix (e.g., `MRK-XXXX`, `ADM-XXXX`)
- Approval-based mutations for sensitive actions:
  - **Toggle Active/Suspend**: admin submits `ApprovalRequest` → company approves/rejects
  - **Soft Delete**: admin submits `ApprovalRequest` → company approves/rejects
  - Prevents direct deletion of company-created users by admins
  - Prevents suspending the last active admin

### 5.11 Bank Account Management

**File**: `src/core/services/bank.service.ts`

- Marketers can add/remove/switch bank accounts via Paystack
- Account verification (name lookup via Paystack)
- Exactly one primary account required for transfers
- Cannot delete account with active transfer in progress

### 5.12 Internal Notifications

**Files**: `src/infrastructure/internal_notification/notification.orchestrator.ts`, `notification.repository.ts`, `notification.template.ts`

- Type-safe event routing system
- Human-readable DB notifications with idempotency keys
- Event types: KYC submission, installment reminders (3-day, due-today, 3-day overdue, 7-day overdue), commission events, marketer management events
- Notification recipients determined by business role:
  - **KYC submitted**: Marketer + Admin (or Super Admin fallback)
  - **7-day overdue**: Customer + Marketer + Admin (escalation)
  - **Commission events**: Marketer + Company approvers

### 5.13 Email Delivery

**File**: `src/core/services/email.service.ts`, `mail-worker/`

- Dual delivery modes: **Brevo** (production) or **Cloudflare Worker** (alternative)
- Handlebars templates in `mail-templates/`
- Covers: welcome, password reset, staff creation, onboarding, installment reminders, commission events, account changes

### 5.14 Webhook Security

**File**: `src/api/controllers/webhook.controller.ts`, `src/core/services/paystack.service.ts`

- HMAC-SHA512 signature verification using `x-paystack-signature` header
- Timing-safe comparison (prevents timing attacks)
- Idempotency via `WebhookEvent` table (processed flag)
- Raw body parsing (mounted BEFORE JSON middleware)

---

## 6. Scheduled Jobs (Cron)

| Job | Schedule | Queue | Purpose |
|-----|----------|-------|---------|
| **KYC Retention** | Daily 00:00 | `kyc-retention-queue` | Purge expired KYC documents |
| **Payment Reminders** | Daily 00:00 | `payment-reminder-queue` | Scan and dispatch installment reminders at 3-day, due-today, 3-day overdue, 7-day overdue |
| **Ledger Reconciliation** | Daily 02:00 | `ledger-reconciliation-queue` | Verify + auto-correct ledger account balances |

---

## 7. Event-Driven Architecture

**File**: `src/core/events/emitter.ts`, `src/core/events/event.types.ts`

```
emitEvent()
    │
    ├──► [Local handlers] — in-process side effects
    │
    └──► [Cloudflare Notification Hub] — centralized email dispatcher
              └──► Brevo SMTP or Mail Worker
```

Domain events cover:
- User lifecycle (`USER_REGISTERED`, `STAFF_CREATED`)
- Pricing (`PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET_COMPLETED`, `PASSWORD_CHANGED`)
- Order flow (`ORDER_CREATED`, `ORDER_CANCELLED`, `ORDER_STATUS_UPDATED`)
- Installment lifecycle (`INSTALLMENT_REMINDER_3DAY`, `INSTALLMENT_DUE_TODAY`, `INSTALLMENT_OVERDUE_3DAY`, `INSTALLMENT_OVERDUE_7DAY`, `INSTALLMENT_PAID`)
- Commission finance (`COMMISSION_TRANSFER_INITIATED`, `COMMISSION_TRANSFER_SUCCESS`, `COMMISSION_TRANSFER_FAILED`, `COMMISSION_TRANSFER_REVERSED`)
- User management (`MARKETER_ACCOUNT_DELETED`, `MARKETER_TOGGLE_STATUS`, `ADMIN_ACCOUNT_DELETED`, `ADMIN_TOGGLE_STATUS`)

---

## 8. Middleware Stack

| Middleware | Purpose |
|------------|---------|
| `helmet()` | Security headers |
| `express.json()` / `express.urlencoded()` | Body parsing |
| `cookie-parser` | Cookie parsing for CSRF |
| `express-session` (Prisma store) | Session state for CSRF |
| `sanitizer` | Input sanitization |
| `csrfMiddleware` | CSRF protection (double-submit) |
| `requireAuth` | JWT access token + session revocation check |
| `requireRole([r1, r2])` | RBAC role guard |
| `rateLimiter` | Request rate limiting |
| `errorHandler` | Central error formatting with type-safe responses |

---

## 9. Key Business Rules

1. **KYC Dual-Signature**: Both `marketer` AND `admin` must approve before financing activates
2. **FIFO Commission Allocation**: Oldest commissions are consumed first during payout requests
3. **No Negative Balance**: Commission allocation greedy loop ensures total reserved never exceeds requested amount
4. **Idempotent Payments**: `reference` (Paystack ref) + `idempotencyKey` prevents double-processing
5. **Immediate Document Purging**: On approval/rejection, KYC assets are instantly scheduled for deletion (NDPR compliance)
6. **Ledger Integrity**: Ledger reconciliation runs daily, auto-corrects drift, caches in Redis
7. **Transfer Retry**: BullMQ retries (3x, exponential backoff) → on final failure, commissions are released back to ACTIVE
8. **Approval-Based Admin Actions**: Admin cannot directly delete/suspend marketers — must submit approval request to company

---

## 10. Database Patterns

- **UUIDs**: All business IDs (`userId`, `companyId`, `contractId`, etc.) use `uuid()` unique identifiers
- **Soft Delete**: `User.deletedAt`, `KycDocumentAsset.isDeleted` — no hard deletes
- **Immutable Audit Trail**: `KycAuditTrail` and `FinancialTransaction` are append-only
- **Idempotent Unique Constraints**: `WebhookEvent.id`, `PasswordReset.otpHash`, `CommissionPayoutRequest.payoutId`
- **Redis Caching**: Reconciliation results, notification reads

---

## 11. Deployment

- **Runtime**: Docker container (`Dockerfile`) with multi-stage build
- **ORM**: Prisma 7 with postgresql provider (Neon/serverless compatible)
- **Queue**: BullMQ over Redis (supports Redis Cluster)
- **Process Management**: 3 separate `npm run` commands (`start`, `start:worker`, `start:scheduler`)
- **CI/CD**: GitHub Actions workflow (`deploy.yml`)
- **Hosting**: Render (`render.yaml` with separate service definitions for API, worker, scheduler)
