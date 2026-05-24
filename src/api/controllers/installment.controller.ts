import { Request, Response } from "express";
import { InstallmentService } from "@/core/services/installment.service";

export class InstallmentController {
  /**
   * GET /installments/:contractId
   */
  static async getCustomerInstallments(req: Request, res: Response) {
    const contractId = req.params.contractId as string;

    const data = await InstallmentService.getCustomerInstallments(contractId);

    return res.status(200).json({
      success: true,
      message: "Installments retrieved successfully",
      data,
    });
  }

  /**
   * GET /installments/:contractId/products
   */
  static async getFinancedProducts(req: Request, res: Response) {
    const contractId = req.params.contractId as string;

    const data = await InstallmentService.getFinancedProducts(contractId);

    return res.status(200).json({
      success: true,
      message: "Financed products retrieved successfully",
      data,
    });
  }

  /**
   * GET /installments/:contractId/progress
   */
  static async getProgress(req: Request, res: Response) {
    const contractId = req.params.contractId as string;

    const data =
      await InstallmentService.calculateProgressPercentage(contractId);

    return res.status(200).json({
      success: true,
      message: "Payment progress retrieved successfully",
      data,
    });
  }

  /**
   * POST /installments/:installmentId/pay
   */
  static async initializePayment(req: Request, res: Response) {
    const installmentId = req.params.installmentId as string;
    const customerId = req.user!.userId;

    const data = await InstallmentService.initializeInstallmentPayment(
      installmentId,
      customerId,
    );

    return res.status(200).json({
      success: true,
      message: "Payment initialized successfully",
      data,
    });
  }
}
