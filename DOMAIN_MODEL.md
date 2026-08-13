# InstalFlow Domain Model

> Companion to [`PROJECT_WORKFLOW.md`](./PROJECT_WORKFLOW.md). That document is the PRD and engineering golden rules; this document is the **business-language map of bounded contexts** — what each domain owns, what it deliberately does not own, and how domains talk to each other through events. Read this before adding a model, a service, or a new domain.

## The core, in one sentence

**InstalFlow exists to manage installment financing, pay marketer commissions accurately, and remind everyone involved before money is late.** Every other domain in this document — Identity, Catalog, KYC, Ledger, Merchant Settlement, Billing, Analytics — exists to *serve* those three. If a change to a supporting domain makes installment scheduling, commission accuracy, or reminder delivery slower, riskier, or less correct, that change is wrong regardless of how good it looks on its own.

```
                     ┌─────────────────────────────┐
                     │   THE THREE DELIVERABLES    │
                     │                              │
                     │   Installment Management     │
                     │   Marketer Commissions        │
                     │   Installment Reminders       │
                     └──────────────┬───────────────┘
                                    │ depend on / protected by
   ┌───────────┬───────────┬───────┼───────┬───────────┬───────────┐
   │           │           │       │       │           │           │
Identity    Catalog       KYC   Ledger  Merchant    Billing    Analytics
(who can   (what's      (gate  (financial Settlement (company   (reporting
 act)       financed)   to     truth)    (auto-      subs,      over core)
                         activ-           matic       partial —
                         ation)           company     see §10)
                                          payout)

                          future, deferred until core is proven:
                                    Developer API · Capital
```

---

## How to read each domain entry

- **Owns** — the Prisma models and files this domain is the single writer for.
- **Does not own** — the adjacent thing it's tempting to also own, and who actually owns it. This is the part worth reading most carefully; boundary confusion is where bugs and rewrites come from.
- **Publishes** — `DomainEvent`s (`src/core/events/event.types.ts`) it emits via `emitEvent()`.
- **Subscribes to** — events it reacts to, and where (`core/events/handlers/notification.handler.ts` via `onEvent()`, or a direct service call).
- **Public service interface** — the `core/services/*.ts` entry points other domains are allowed to call.
- **Extension points** — where planned future work plugs in without moving domain boundaries.

---

## 1. Installment Management — CORE

**Purpose**: Turn an approved financing contract into a correct payment schedule, collect each installment, and track its lifecycle from `PENDING` to `PAID` (or `OVERDUE`/`DEFAULTED`).

**Owns**: `FinancingContract`, `Installment`, `Payment`, `PaymentIntent` (type `INSTALLMENT`), `ProductInstallmentPlan` (the plan config a contract is generated from).

**Does not own**:
- Commission calculation on a successful payment — that's §2 Commission, triggered off the same payment event, not computed inline by this domain going forward (see the atomicity note below).
- The merchant's share of a collected payment — that's §3 Merchant Settlement. This domain only earmarks it (`MERCHANT_SETTLEMENT_EXPENSE`/`MERCHANT_PAYABLE` ledger entries in `payment.worker.ts`); it never decides when or how the company actually gets paid.
- Reminder scheduling/dispatch — that's §4 Reminders. This domain only exposes installment due-dates for the reminder scheduler to query; it does not decide *when* or *how* to notify.
- KYC approval — this domain only activates a contract once `KycApplication.status = APPROVED`; it does not run the approval workflow itself (§6 KYC).
- The financial journal — every ledger posting happens through `LedgerService`, never by writing balances directly.

**Publishes**: `DomainEvent.INSTALLMENT_PAID`, `DomainEvent.CONTRACT_RESTRUCTURED`, `DomainEvent.CONTRACT_WRITTEN_OFF` (both mirror the existing `InternalNotificationType` in-app notification, emitted from `financing.service.ts` alongside it, delivered via the notification-hub with dedicated templates — same dual-path pattern as §3/§10). Contract activation itself still has no `DomainEvent`, only the in-app notification.

**Subscribes to**: KYC dual-approval completion (currently a direct service call from `kyc.service.ts` into `installment.service.ts`'s `generateInstallmentSchedule()`, not an event — see the event-driven note below).

**Public service interface**: `installment.service.ts` (`generateInstallmentSchedule()`, `initializeInstallmentPayment()`), `installment-plan.service.ts`, `installment-eligibility.helper.ts`, `financing.service.ts` (contract state transitions). Payment verification lives in `job-workers/payment.worker.ts` (consumes `PaymentQueue`), with automatic recovery for stuck intents via `job-workers/payment-recovery.worker.ts`.

**Financial rule that overrides "event-driven everything"**: `payment.worker.ts` verifying a Paystack charge, marking the `Installment` `PAID`, and writing the `PAYSTACK_CLEARING`/`CUSTOMER_RECEIVABLE`/commission/merchant-settlement ledger entries must stay inside **one Prisma `$transaction`** — this is the Atomic Persistence golden rule in `PROJECT_WORKFLOW.md`. Only *after* that transaction commits should `INSTALLMENT_PAID` (and a future `PAYMENT_SUCCEEDED`) be emitted for downstream listeners (commission accrual, reminders-cancel, analytics). Event-driven applies to side effects; the payment/installment/ledger write itself stays synchronous and atomic.

**Shipped**: Marketer-free / company-direct checkout. `OnboardingSession.marketerId` is now nullable; `KycService.registerDirect()` lets a COMPANY or ADMIN user register a customer with no marketer in the loop (`kyc.routes.ts`: `POST /kyc/register-direct`), and `Company.publicSignupCode` (`POST /kyc/company-signup-code`) enables a genuinely public marketer-free signup link. `approveApplication()` now supports a single-approver path (skips the marketer-approval precondition) when `session.marketerId` is null.

**Extension points**: Collections workflow (promise-to-pay tracking, follow-up assignment) extends this domain rather than becoming a new one — it operates on the same `FinancingContract`/`Installment` records once `OVERDUE`. Refunds/voids belong here too — `InstallmentStatus.VOIDED` is already written (`financing.service.ts`, when a contract is restructured or written off, its remaining non-`PAID` installments are voided and a fresh schedule generated), so this is narrower than previously noted: a standalone refund/void flow independent of restructure/write-off is the actual gap.

---

## 2. Marketer Commission — CORE

**Purpose**: Accrue the correct commission on every successful installment payment, and pay the eligible referrer out reliably.

**Owns**: `Commission`, `CommissionAllocation`, `CommissionPayoutRequest`, `MarketerBankAccount`.

**Does not own**:
- Payment verification — commission accrual reacts to a payment succeeding, it doesn't verify the payment itself (§1).
- The merchant/company's own settlement — strictly separate financial obligation, see §3. Commission and merchant settlement are computed from the same payment but are never conflated into one "payout" concept.
- The actual bank transfer *execution mechanics* against Paystack are owned here (`transfer.worker.ts`), but the ledger posting that makes the transfer financially real is owned by §5 Ledger.
- Marketer/admin account lifecycle (suspend/delete) is owned by user-management (`user-management.service.ts`, `ApprovalRequest`), not this domain — commission only reacts to a referrer existing and being in good standing.

**Publishes**: `COMMISSION_TRANSFER_INITIATED`, `COMMISSION_TRANSFER_SUCCESS`, `COMMISSION_TRANSFER_FAILED`, `COMMISSION_TRANSFER_REVERSED`.

**Subscribes to**: Installment payment success (today: a direct call inside `payment.worker.ts` after the ledger transaction commits, not a decoupled event listener — see §1's extension note, this is the concrete place to introduce `PAYMENT_SUCCEEDED` as a real event). Paystack `transfer.success` / `transfer.failed` / `transfer.reversed` webhooks via `webhook-processor.service.ts`.

**Public service interface**: `commission.service.ts` (`requestPayout()` — FIFO allocation over oldest `Commission` records first, `initiateTransfer()`, `initiateBulkTransfer()`), `bank.service.ts` (marketer/admin bank account CRUD + Paystack verification).

**Non-negotiable invariant**: total `reservedAmount` across a referrer's commissions must never exceed the amount requested in a payout — the FIFO greedy-allocation loop in `requestPayout()` is what guarantees this. Any change to allocation logic must preserve it.

**Shipped**: Commission eligibility is no longer hardcoded to `Role.MARKETER`. `COMMISSION_ELIGIBLE_ROLES = [MARKETER, ADMIN]` (`src/shared/utils/helpers/commission-eligibility.ts`) is the single source of truth for who can be a commission-eligible referrer — extending it to a future role is a one-line change, not a redesign. An ADMIN who registers a customer directly (via §1's `registerDirect`) becomes that customer's `referredByMarketer`, exactly like a marketer referral. `requestPayout()` routes an ADMIN's own payout request straight to `PENDING_COMPANY_APPROVAL` (no higher admin exists to check them). `bank.routes.ts` and `comission.routes.ts`'s commission-earning endpoints are now guarded by `COMMISSION_ELIGIBLE_ROLES` instead of `[MARKETER]`.

**Extension points**: Commission tiering (rate varies by referrer performance, not just `Product.commissionRate`), bulk/scheduled payout runs instead of on-demand requests.

---

## 3. Merchant Settlement — pays the company, strictly separate from Commission

**Purpose**: Pay the company (merchant/tenant) its share of collected installment payments — fully automatically. This is a distinct financial obligation from Commission (§2), even though both are computed from the same payment and both eventually move money via a Paystack transfer.

**Owns**: `CompanyBankAccount`, `MerchantSettlementRequest`, `MerchantSettlementLine`, `MerchantSettlementAuditTrail`.

**Does not own**:
- The decision to move money — settlement is **system-generated and system-approved**. There is no `POST /merchant-settlements/:id/initiate-transfer` or `/approve` for COMPANY; COMPANY is a read-only beneficiary (`GET /merchant-settlements`, `GET /merchant-settlements/:id`, `GET /merchant-settlements/:id/audit-trail`, all scoped to their own company). This is the central rule of this domain: **the company is the beneficiary, never the initiator or approver.**
- Commission calculation — a settlement's `netAmount` per line is `grossAmount - commissionDeducted`, but the commission figure itself is read from §2's `Commission` records, not recomputed here.
- Ledger posting mechanics — reuses `LedgerService.recordTransaction()` unchanged (see §5).

**Publishes**: `MERCHANT_SETTLEMENT_GENERATED`, `MERCHANT_SETTLEMENT_TRANSFER_INITIATED`, `MERCHANT_SETTLEMENT_TRANSFER_SUCCESS`, `MERCHANT_SETTLEMENT_TRANSFER_FAILED`, `MERCHANT_SETTLEMENT_TRANSFER_REVERSED`.

**Subscribes to**: Nothing directly — the weekly `MerchantSettlementGenerationWorker` (cron `0 6 * * 1`) drives generation by querying `PAID` installments with no existing `MerchantSettlementLine`, not by listening to `INSTALLMENT_PAID`. (A future refinement could make this event-driven; today it's a polling sweep, matching the installment-reminder worker's own pattern.)

**Public service interface**: `merchant-settlement.service.ts` — `generateForCompany()`/`generatePendingSettlements()` (auto-generate + auto-approve, idempotent: an installment with an existing line is never selected again), `queueEligibleTransfers()` (auto-queues a transfer once a company has a verified primary bank account, with zero HTTP trigger required), `getAuditTrail()` (COMPANY-own or SUPER_ADMIN), `retryTransfer()` (**SUPER_ADMIN-only** operational recovery for a `TRANSFER_FAILED`/`TRANSFER_REVERSED` settlement — explicitly not an approval step). `company-bank.service.ts` mirrors `bank.service.ts` for company-level bank accounts.

**State machine**: `GENERATED → APPROVED → TRANSFER_INITIATED → TRANSFER_SUCCESS` (happy path), or `TRANSFER_INITIATED → TRANSFER_FAILED/TRANSFER_REVERSED → (SUPER_ADMIN retry) → TRANSFER_INITIATED`. `TRANSFER_SUCCESS` is set **only** by a verified Paystack `transfer.success` webhook (`webhook-processor.service.ts`, `MST-` reference prefix disambiguates from commission payout webhooks sharing the same Paystack event types) — the transfer worker successfully calling Paystack is never treated as completion.

**Non-negotiable invariant**: `MerchantSettlementLine.installmentId` is globally unique (DB-enforced) — an installment can belong to at most one settlement, ever. This is what makes settlement generation safe to re-run on any schedule without double-paying a company.

**Ledger accounts**: `MERCHANT_PAYABLE` (LIABILITY) / `MERCHANT_SETTLEMENT_EXPENSE` (EXPENSE) — earmarked at payment time in `payment.worker.ts`, mirroring the `COMMISSION_PAYABLE`/`COMMISSION_EXPENSE` pair exactly so the two obligations stay independently traceable while both being self-balanced (neither re-touches `PAYSTACK_CLEARING`).

**Notifications**: the 5 `MERCHANT_SETTLEMENT_*` events (and §4/§10's 6 subscription events) are not wired in `notification.handler.ts`'s local `NotificationService`/`InternalNotification` path — they're delivered via the Cloudflare notification-hub instead. All 11 events and their branded HTML templates (`mail-templates/merchant-settlement-*.html`, `mail-templates/subscription-*.html`) are wired in `workers/notification-hub/src/router/event.router.ts`, which every `emitEvent()` call reaches unconditionally via `forwardToHub()`. Audit trail (`MerchantSettlementAuditTrail`) remains the reliable record regardless of which channel renders the email.

---

## 4. Reminders & Notifications — CORE

**Purpose**: Make sure no customer, marketer, admin, or company owner is ever surprised — every installment due-date, overdue escalation, commission event, settlement event, subscription renewal, and account action produces a timely, correctly-routed notification.

**Owns**: `InternalNotification` (in-app), the fan-out logic in `core/events/handlers/notification.handler.ts`.

**Does not own**: the business event itself — this domain never decides that an installment is overdue or a commission was paid; it only reacts. It also does not own the Cloudflare `notification-hub` worker's internals (that's a separate deployable, see its own `AGENTS.md`) — it only calls into it via `emitEvent()`'s `forwardToHub()`.

**Fan-out pattern (verified in code, not assumed)**: every reminder-shaped event handler in `notification.handler.ts` does two things in sequence: (1) `NotificationService.send()` — routes to `NotificationChannel.EMAIL` today; SMS/WhatsApp would be a new channel here, not a new domain — and (2) `NotificationOrchestrator.handle()` — writes the in-app `InternalNotification` row via `infrastructure/internal_notification/`. Separately, `emitEvent()` *also* unconditionally forwards every event to the Cloudflare notification hub (`forwardToHub()` in `core/events/emitter.ts`) regardless of whether a local handler is registered. **Worth verifying which path is currently authoritative for production email** (local `NotificationService` vs. the hub) before adding a third channel — right now both fire for every reminder event, which may be intentional redundancy or may be a migration-in-progress artifact.

**Subscribes to**: `INSTALLMENT_REMINDER_3DAY`, `INSTALLMENT_REMINDER_1DAY`, `INSTALLMENT_DUE_TODAY`, `INSTALLMENT_OVERDUE_RECURRING`, `INSTALLMENT_OVERDUE_3DAY`, `INSTALLMENT_OVERDUE_7DAY`, `INSTALLMENT_PAID`, `COMMISSION_TRANSFER_*` (all four), `MARKETER_ACCOUNT_DELETED`, `MARKETER_TOGGLE_STATUS`, `ADMIN_ACCOUNT_DELETED`, `ADMIN_TOGGLE_STATUS`, `ONBOARDING_SESSION_EXPIRED`, `KYC_APPLICATION_AUTO_EXPIRED`, `USER_REGISTERED`, `STAFF_CREATED`, `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET_COMPLETED`, `PASSWORD_CHANGED`, `COMPANY_ONBOARDED`. This domain is intentionally a universal listener — almost every other domain's terminal step is "tell Notifications." **Not subscribed locally** (see §3's Notifications note): `MERCHANT_SETTLEMENT_*` (5 events), `SUBSCRIPTION_RENEWAL_REMINDER_*`/`SUBSCRIPTION_GRACE_PERIOD_*`/`SUBSCRIPTION_EXPIRES_TODAY`/`SUBSCRIPTION_RESTRICTED` (6 events) — all 11 exist in `event.types.ts`, are correctly emitted by their respective workers, and are delivered via the notification-hub instead of this local handler.

**Reminder cadence** (produced by `job-workers/installment-payment-reminder.worker.ts`, cron-driven by `schedulers/installment-payment-reminder.scheduler.ts` daily at 00:00): 3-day-before, 1-day-before, due-today, recurring-overdue, 3-day-overdue (escalates to marketer), 7-day-overdue (escalates to marketer **and** admin). This escalation ladder is a core product deliverable, not a generic utility — treat changes to it with the same care as ledger changes. The `dayWindow()`/`ensureReminderSent()` idempotency helpers were extracted to `src/shared/utils/helpers/date-window.ts` (used by both this worker and §10's subscription renewal worker) — no behavior change, pure de-duplication.

**Extension points**: SMS/WhatsApp channel (no Twilio or equivalent is wired in today despite being named in `PROJECT_WORKFLOW.md`'s tech stack — that line is aspirational, not implemented), per-company reminder configuration (cadence/channels are currently hardcoded, not a `NotificationPreference` per `Company`), outbound webhooks so a merchant's own system can react to these same events (currently these events only reach InstalFlow's own channels).

---

## Supporting domains

### 5. Ledger — financial truth for the three core deliverables

**Owns**: `LedgerAccount`, `FinancialTransaction`, `JournalEntry`, `WebhookEvent` (Paystack idempotency).

**Does not own**: the business decision to move money (that belongs to whichever domain triggered it — Installment payment, Commission transfer, Merchant Settlement transfer) — Ledger only guarantees that once triggered, the movement is recorded as a balanced double-entry and is derivable, never stored as a mutable balance.

**Public service interface**: `ledger.service.ts` (`recordTransaction()` — generic, reusable, unchanged by any of the new domains above; auto-creates `LedgerAccount` on first use, idempotent upsert on `reference`), `ledger-reconciliation.service.ts` (daily 02:00 drift correction, Redis-cached 25h).

**Rule**: Ledger is a *service*, not a gatekeeper — it never decides whether a payment is valid, it only refuses to let two domains post an unbalanced or duplicate entry.

**Account names in use today**: `PAYSTACK_CLEARING`, `CUSTOMER_RECEIVABLE`, `COMMISSION_EXPENSE`/`COMMISSION_PAYABLE`, `MERCHANT_SETTLEMENT_EXPENSE`/`MERCHANT_PAYABLE`, `PAYOUTS_IN_TRANSIT`, `BANK_SETTLED`, `PLATFORM_REVENUE`. No per-installment platform-fee account exists (no rate is configured anywhere for one) — `PLATFORM_REVENUE` today only comes from subscription/onboarding fees, not a cut of installment payments.

### 6. KYC — the gate before Installment Management can activate a contract

**Owns**: `KycApplication`, `KycDocumentAsset`, `KycAuditTrail`, `OnboardingSession`.

**Does not own**: schedule generation or contract activation itself — on approval (dual `marketerApproved && adminApproved`, or single-approver when no marketer is attached — see §1), it hands off to `installment.service.ts`. It also does not own document retention policy execution — that's `KycRetentionWorker` (in `shared/job-workers/`), triggered both by the `KycRetentionQueue` worker and directly by `schedulers/kyc-retention.scheduler.ts`.

**Public service interface**: `kyc.service.ts` (`registerViaReferral()`, `registerDirect()`, `generateCompanySignupCode()`, application submission, approval), `kyc-storage.service.ts` (Cloudinary upload/delete).

**Tenant-isolation note**: `getSignedDocumentUrl()` now explicitly checks `session.companyId === reviewer.companyId` when a KYC session has no marketer attached — this closes a cross-tenant document-access gap that was previously unreachable (marketer was always required) but became reachable once `marketerId` was made optional.

### 7. Identity — who is allowed to act on the core domains

**Owns**: `User`, `UserSession`, `PasswordReset`, `Session`, `ApprovalRequest` (admin-action maker-checker), `Company` (tenant boundary, now also carries `publicSignupCode`).

**Public service interface**: `auth.service.ts`, `user-management.service.ts`.

**Rule**: `requireRole([...])` on routes is the enforcement point — no domain service should re-implement role checks; they trust the controller layer already gated access. Services still re-verify the caller's role/company from the DB as defense-in-depth (see `MerchantSettlementService`, `CommissionService` for examples), not just the route guard.

### 8. Catalog — what's being financed

**Owns**: `Product`, `ProductVariant`, `Category`, `ProductImage`, `ProductVariantImage`, `Referral` (referrer-to-product attribution — written only when a marketer is attached; skipped for marketer-less/company-direct approvals).

**Public service interface**: `product.service.ts`, `product-image.service.ts`, `category.service.ts`, `variant.service.ts`.

### 9. Analytics — reporting over everything above

**Owns**: read-only aggregation logic in `analytics.service.ts`. Owns no models of its own — by design, so it can never become a source of truth that drifts from the Ledger.

---

## 10. Billing — partially shipped: renewal reminders live, invoicing still deferred

Company SaaS subscription health (Company pays InstalFlow) — strictly separate from customer installment financing (§1) and merchant settlement (§3), per the explicit business-model rule: **SaaS Billing, Customer Financing, Commission, and Merchant Settlement are four different financial flows that happen to share ledger/payment infrastructure.**

**Shipped**: `SubscriptionStatus` now includes `GRACE_PERIOD`/`RESTRICTED` (alongside existing `PENDING`/`ACTIVE`/`EXPIRED`/`CANCELLED`); `SubscriptionPlan.gracePeriodDays` (default 7). `SubscriptionService.renewSubscription()` — click-to-renew (not auto-charge; no stored Paystack authorization/card token exists in this codebase, so silent recurring billing is a separate future project) via `POST /subscription/renew`. Daily (`0 3 * * *`) `SubscriptionRenewalWorker` (`src/shared/job-workers/subscription-renewal.worker.ts`) mirrors the installment reminder worker's exact shape: 7-day and 3-day renewal reminders, expires-today reminder, `ACTIVE → GRACE_PERIOD` transition on expiry, a grace-period-expiring reminder, and `GRACE_PERIOD → RESTRICTED` transition once the grace window elapses. `verifySubscription()` now defensively expires any other non-`EXPIRED` `CompanySubscription` row for a company before activating a new one, so a late webhook racing the scheduler can't leave two non-expired rows.

**Access enforcement, shipped**: `RESTRICTED` now gates the API — `requireActiveSubscription` (`src/api/middlewares/subscription.guard.ts`) is chained right after `requireAuth` on every company-scoped mutating route (installment, commission, product, admin, customer-management, bank/company-bank, variants, kyc, company, category, financing). It's a **read-only** restriction: `GET`/`HEAD`/`OPTIONS` always pass; `SUPER_ADMIN` and `CUSTOMER` are exempt by role (a merchant's own lapsed SaaS subscription must never block its customers from paying installments); `/auth` and `/subscriptions` routes never carry the guard so a restricted company can still log out, change password, and renew. Everything else — including `MARKETER` mutations — is blocked with a 403 once the company's most recent `CompanySubscription.status` is `RESTRICTED`. New index: `CompanySubscription(companyId, createdAt)`, since this guard now queries it on every non-GET request from a company-scoped role.

**Open question, not yet decided**: the guard blocks *all* company-scoped mutations uniformly, including a `MARKETER`'s own commission payout request for money they already earned — that's arguably a different actor's money being held hostage by the company's unrelated SaaS billing lapse. Flagged, not fixed; revisit if this causes real friction.

**Not built**: `Invoice`, `Coupon`, dunning beyond the reminder ladder above. **Do not let this domain's renewal reminders share code with §4's installment reminders just because both are "reminders"** — they have different audiences (company owner vs. customer), different stakes, and are kept in separate files/tables even though both emit through the same `emitEvent()` mechanism and now share the extracted `dayWindow()`/`ensureReminderSent()` utility (mechanical de-duplication only, not a merge of the domains).

### 11. Developer Platform (future) — no code exists yet

Would own: `ApiKey`, `WebhookEndpoint`/`WebhookDelivery`, sandbox/live `mode`. Explicitly deferred until merchants using the Stage-1 dashboard ask for it — see `PROJECT_WORKFLOW.md` roadmap.

### 12. Capital (future) — funding partner layer

Would own: `FundingSource`, `RiskAssessment`, `ContractAgreement` (e-signed). Requires Installment Management and Ledger to be provably reliable first — a lender partner is underwriting InstalFlow's process, not just a borrower.

---

## Known gaps and inconsistencies (accumulated across builds, not yet resolved)

- Commission accrual has an `InternalNotificationType.COMMISSION_ACCRUED` value but no matching `DomainEvent` — accrual notifications go through the internal (DB-only) path exclusively, not email. Left as-is deliberately: a marketer doesn't need an email for every individual accrual, only for the payout itself (`COMMISSION_TRANSFER_*`, which does email). Revisit only if that assumption turns out wrong in practice.
- §3's and §10's new `DomainEvent`s (11 total: 5 settlement, 6 subscription), plus §1's `CONTRACT_RESTRUCTURED`/`CONTRACT_WRITTEN_OFF` (2 more), have no `onEvent()` handler in `notification.handler.ts` (the local in-app/direct-email path) — see each section's "Notifications" note. They *are* fully wired end-to-end via the notification-hub: all 13 have entries in `workers/notification-hub/src/router/event.router.ts` and matching branded HTML files in `mail-templates/`. This dual-path split (local handler vs. hub) is now the established convention for every event added since the settlement/commission revision — new events should follow the hub-only path unless there's a specific reason to also fire the local in-app notification.
- Four Prisma migrations are pending against the dev database as of this build (marketer-optional checkout, merchant settlement models, subscription grace period, `CompanySubscription` status index) — run `pnpm run db:migrate:deploy` before deploying; migrations could not be applied from the environment this work was done in (no network path to the Neon host).

### Resolved this pass
- `DomainEvent.ORDER_CREATED`/`ORDER_CANCELLED`/`ORDER_STATUS_UPDATED`, the unmounted `EmailController`, the corresponding `EmailTemplate` enum entries, and the 3 `order-*.html` templates were confirmed dead (no `Order` model ever existed in this domain, `EmailController` was never mounted to any route) and removed from both the API and the notification-hub.
- `CONTRACT_RESTRUCTURED`/`CONTRACT_WRITTEN_OFF` now emit real `DomainEvent`s alongside the existing in-app notification (see §1's Publishes line) — a restructured or written-off contract now emails the affected marketer/admin/company, not just an in-app notification.
- §10's subscription `RESTRICTED` status is now enforced — see §10's "Access enforcement" note. No longer just a tracked state.
