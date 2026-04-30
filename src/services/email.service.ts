import { BrevoClient, Brevo } from "@getbrevo/brevo";
import handlebars from "handlebars";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path logic to handle both dev (src/services) and build (dist/src/services) locales
const TEMPLATES_DIR = path.resolve(__dirname, "../../mail-templates");

export enum EmailTemplate {
  WELCOME = "welcome",
  MARKETER_WELCOME = "marketer-welcome",
  OTP_VERIFICATION = "otp-verification",
  PASSWORD_RESET = "password-reset",
  FORGOT_PASSWORD_OTP = "forgot-password-otp",
  ORDER_CONFIRMATION = "order-confirmation",
  ORDER_CANCELLED = "order-cancelled",
  ORDER_STATUS_UPDATE = "order-status-update",
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

  /**
   * Compiles and returns the HTML content from the template file
   */
  private static getTemplate(templateName: EmailTemplate, context: any) {
    const filePath = path.join(TEMPLATES_DIR, `${templateName}.html`);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Template not found: ${filePath}`);
    }

    const source = fs.readFileSync(filePath, "utf-8");
    return handlebars.compile(source)(context);
  }

  /**
   * Offloads email sending to an external Cloudflare Worker / microservice
   */
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

  /**
   * Sends email directly via Brevo Transactional API (v5.x SDK)
   */
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

  /**
   * Entry point for sending emails
   */
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
