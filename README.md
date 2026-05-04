# Instalflow Backend Engine

Instalflow is a high-integrity, **ledger-first** fintech infrastructure designed to handle secure payment-gated onboarding, automated marketer commissions, and auditable financial movements. It utilizes a professional **Double-Entry Bookkeeping** system to ensure transaction atomicity and financial consistency.

## 🚀 Core Features

### 1. Double-Entry Ledger System
*   **Immutable Financial Truth**: Every financial event (payments, commissions, withdrawals) creates a set of balanced Journal Entries.
*   **System Accounts**: Built-in support for `PAYSTACK_CLEARING`, `PLATFORM_REVENUE`, and `MARKETER_PAYABLE`.
*   **Precision**: Uses `Prisma.Decimal` for high-precision financial calculations, avoiding floating-point errors.

### 2. Secure Payment-Gated Onboarding
*   **Pre-Validation**: Ensures email and company name availability before the user proceeds to payment.
*   **Pending State**: Persists user intent in a `PendingOnboarding` table to handle session drops.
*   **Auto-Onboarding**: A robust Webhook safety net that automatically creates accounts upon successful Paystack payment, even if the user closes their browser.

### 3. Edge-Native Architecture
*   **Hybrid Deployment**: Main API server hosted on **Render**, with lightweight microservices (Email, Notifications) hosted on **Cloudflare Workers**.
*   **Neon Integration**: Optimized for **Neon Serverless Postgres**, utilizing driver adapters for zero-latency edge access.
*   **Rate Limiting & Security**: Built-in `express-rate-limit` and custom session-bound CSRF protection.

## 🛠 Tech Stack

*   **Runtime**: Node.js / Cloudflare Workers
*   **Framework**: Express.js
*   **Database**: PostgreSQL (via Neon)
*   **ORM**: Prisma
*   **Payments**: Paystack
*   **Emails**: Brevo (via Cloudflare Email Worker)
*   **CI/CD**: GitHub Actions

## 🚦 Getting Started

### Prerequisites
*   Node.js (v18+)
*   PNPM (v10+)
*   PostgreSQL Instance (Local or Neon)

### Installation
1.  **Clone the repository**:
    ```bash
    git clone https://github.com/jettechnologies/instalflow-backend-service.git
    cd instalflow-backend-service
    ```
2.  **Install dependencies**:
    ```bash
    pnpm install
    ```
3.  **Setup Environment Variables**:
    Create a `.env` file based on the keys defined in `render.yaml`.
4.  **Database Migration**:
    ```bash
    pnpm run db:migrate
    pnpm run db:generate
    ```
5.  **Start Development Server**:
    ```bash
    pnpm run dev
    ```

## 🌐 Deployment

### Render (Main API)
The project is configured for one-click deployment via the `render.yaml` Blueprint. Ensure you have set the following secrets in your Render dashboard:
*   `DATABASE_URL` (Connection string)
*   `JWT_ACCESS_SECRET`
*   `PAYSTACK_SECRET_KEY`

### Cloudflare Workers (Microservices)
Deploy individual workers using Wrangler:
```bash
pnpm run deploy:mail-worker
```

## 📖 API Documentation
Once the server is running, you can access the interactive Swagger documentation at:
`http://localhost:3000/api-docs`

## 🛡 Security & Integrity
*   **Balanced Books**: The `LedgerService` enforces that `Debits === Credits` for every transaction.
*   **Idempotency**: Webhook events are tracked in the `WebhookEvent` table to prevent double-processing.
*   **CSRF Protection**: All state-changing requests require a valid `x-csrf-token`.

---
© 2026 Jet Technologies. Built for financial integrity.
