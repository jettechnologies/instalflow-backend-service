import { BrevoClient, Brevo } from "@getbrevo/brevo";
import handlebars from "handlebars";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMPLATES_DIR = path.resolve(__dirname, "../../mail-templates");

export enum EmailTemplate {
  WELCOME = "welcome",
  WELCOME_CUSTOMER = "welcome-customer",
  STAFF_WELCOME = "staff-welcome",
  OTP_VERIFICATION = "otp-verification",
  PASSWORD_RESET = "password-reset",
  FORGOT_PASSWORD_OTP = "forgot-password-otp",
  ORDER_CONFIRMATION = "order-confirmation",
  ORDER_CANCELLED = "order-cancelled",
  ORDER_STATUS_UPDATE = "order-status-update",
  COMPANY_ONBOARDING = "company-onboarding",
  INSTALLMENT_PAID = "installment-paid",
  PASSWORD_CHANGED = "password-changed",
  INSTALLMENT_REMINDER_3DAY = "installment-3days-reminder",
  INSTALLMENT_DUE_TODAY = "installment-due",
  INSTALLMENT_OVERDUE_3DAY_CUSTOMER = "installment-overdue-3days-customer",
  INSTALLMENT_OVERDUE_3DAY_MARKETER = "installment-overdue-3days-marketer",
  INSTALLMENT_OVERDUE_7DAY_CUSTOMER = "installment-overdue-7days-customer",
  INSTALLMENT_OVERDUE_7DAY_ADMIN = "installment-overdue-7days-admin",
  COMMISSION_TRANSFER_INITIATED = "commission-transfer-initiated",
  COMMISSION_TRANSFER_SUCCESS = "commission-transfer-success",
  COMMISSION_TRANSFER_SUCCESS_COMPANY = "commission-transfer-success-company",
  COMMISSION_TRANSFER_FAILED_MARKETER = "commission-transfer-failed-marketer",
  COMMISSION_TRANSFER_FAILED_COMPANY = "commission-transfer-failed-company",
  COMMISSION_TRANSFER_REVERSED_MARKETER = "commission-transfer-reversed-marketer",
  COMMISSION_TRANSFER_REVERSED_COMPANY = "commission-transfer-reversed-company",
  MARKETER_ACCOUNT_DELETED = "marketer-account-deleted",
  MARKETER_TOGGLE_STATUS = "marketer-account-toggle",
}

interface SendEmailProps {
  to: string;
  subject: string;
  template: EmailTemplate;
  context: Record<string, any>;
}

export class EmailService {
  private static brevoClient: BrevoClient;

  static {
    const apiKey = process.env.BREVO_API_KEY;
    if (apiKey) {
      this.brevoClient = new BrevoClient({ apiKey });
    }
  }

  private static getTemplate(templateName: EmailTemplate, context: any) {
    const filePath = path.join(TEMPLATES_DIR, `${templateName}.html`);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Template not found: ${filePath}`);
    }

    const source = fs.readFileSync(filePath, "utf-8");
    return handlebars.compile(source)(context);
  }

  private static async sendViaWorker(props: SendEmailProps) {
    const workerUrl = process.env.EMAIL_WORKER_URL;
    if (!workerUrl) {
      throw new Error("EMAIL_WORKER_URL not configured for worker mode");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    // const response = await fetch(workerUrl, {
    //   method: "POST",
    //   headers: {
    //     "Content-Type": "application/json",
    //     "X-Worker-Secret": process.env.EMAIL_WORKER_SECRET || "",
    //   },
    //   body: JSON.stringify(props),
    // });

    // if (!response.ok) {
    //   const errorText = await response.text();
    // throw new Error(`Email worker responded with error: ${errorText}`);
    // }

    try {
      const response = await fetch(workerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Worker-Secret": process.env.EMAIL_WORKER_SECRET || "",
        },
        body: JSON.stringify(props),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Email worker responded with error: ${errorText}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private static async sendViaBrevo(props: SendEmailProps) {
    if (!this.brevoClient) {
      throw new Error("Brevo client not initialized. Check BREVO_API_KEY.");
    }

    const htmlContent = this.getTemplate(props.template, props.context);

    const sendRequest: Brevo.SendTransacEmailRequest = {
      sender: {
        name: "Instalflow",
        email: process.env.SMTP_FROM || "no-reply@instalflow.com",
      },
      to: [{ email: props.to }],
      subject: props.subject,
      htmlContent,
    };

    await this.brevoClient.transactionalEmails.sendTransacEmail(sendRequest);
  }

  static async sendMail(props: SendEmailProps) {
    try {
      const provider = process.env.EMAIL_PROVIDER || "brevo";

      if (provider === "worker") {
        console.log(
          `[EmailService] Sending via worker: ${props.template} -> ${props.to}`,
        );
        await this.sendViaWorker(props);
      } else {
        console.log(
          `[EmailService] Sending via Brevo: ${props.template} -> ${props.to}`,
        );
        await this.sendViaBrevo(props);
      }

      return { success: true };
    } catch (err: any) {
      console.error("[EmailService] Delivery failed:", err?.message || err);
      return { success: false, error: err?.message };
    }
  }
}
