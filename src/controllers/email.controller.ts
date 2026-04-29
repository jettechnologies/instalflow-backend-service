import type { Request, Response } from "express";
import { EmailService, EmailTemplate } from "../services/email.service";
import ApiResponse from "../libs/ApiResponse";

export class EmailController {
  
  /**
   * Sending Welcome Email
   */
  static async sendWelcome(req: Request, res: Response) {
    const { email, name } = req.body;
    const result = await EmailService.sendMail({
      to: email,
      subject: "Welcome to Instalflow 🎉",
      template: EmailTemplate.WELCOME,
      context: { 
        name,
        dashboard_url: process.env.FRONTEND_URL || "https://instalflow.com" 
      },
    });

    if (!result.success) return ApiResponse.internalServerError(res, result.error || "Failed to send email");
    return ApiResponse.success(res, 200, "Welcome email sent");
  }

  /**
   * OTP Verification
   */
  static async sendOTP(req: Request, res: Response) {
    const { email, otp } = req.body;
    const result = await EmailService.sendMail({
      to: email,
      subject: "Verify Your Email - Instalflow",
      template: EmailTemplate.OTP_VERIFICATION,
      context: { otp },
    });

    if (!result.success) return ApiResponse.internalServerError(res, result.error || "Failed to send email");
    return ApiResponse.success(res, 200, "OTP verification email sent");
  }

  /**
   * Password Reset
   */
  static async sendPasswordReset(req: Request, res: Response) {
    const { email, name, reset_url } = req.body;
    const result = await EmailService.sendMail({
      to: email,
      subject: "Password Reset Request",
      template: EmailTemplate.PASSWORD_RESET,
      context: { name, reset_url },
    });

    if (!result.success) return ApiResponse.internalServerError(res, result.error || "Failed to send email");
    return ApiResponse.success(res, 200, "Reset email sent");
  }

  /**
   * Order Confirmation
   */
  static async sendOrderConfirmation(req: Request, res: Response) {
    const { email, orderId, amount, date } = req.body;
    const result = await EmailService.sendMail({
      to: email,
      subject: `Order Confirmation - #${orderId}`,
      template: EmailTemplate.ORDER_CONFIRMATION,
      context: { 
        orderId, 
        amount, 
        date,
        dashboard_url: process.env.FRONTEND_URL || "https://instalflow.com"
      },
    });

    if (!result.success) return ApiResponse.internalServerError(res, result.error || "Failed to send email");
    return ApiResponse.success(res, 200, "Confirmation email sent");
  }

  /**
   * Order Cancelled
   */
  static async sendOrderCancelled(req: Request, res: Response) {
    const { email, orderId } = req.body;
    const result = await EmailService.sendMail({
      to: email,
      subject: `Order Cancelled - #${orderId}`,
      template: EmailTemplate.ORDER_CANCELLED,
      context: { orderId },
    });

    if (!result.success) return ApiResponse.internalServerError(res, result.error || "Failed to send email");
    return ApiResponse.success(res, 200, "Cancellation email sent");
  }

  /**
   * Order Status Update
   */
  static async sendOrderStatusUpdate(req: Request, res: Response) {
    const { email, orderId, newStatus } = req.body;
    const result = await EmailService.sendMail({
      to: email,
      subject: `Status Update - Order #${orderId}`,
      template: EmailTemplate.ORDER_STATUS_UPDATE,
      context: { orderId, newStatus },
    });

    if (!result.success) return ApiResponse.internalServerError(res, result.error || "Failed to send email");
    return ApiResponse.success(res, 200, "Status update email sent");
  }
}
