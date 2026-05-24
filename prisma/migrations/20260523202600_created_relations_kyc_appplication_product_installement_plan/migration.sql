-- AddForeignKey
ALTER TABLE "KycApplication" ADD CONSTRAINT "KycApplication_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycApplication" ADD CONSTRAINT "KycApplication_installment_plan_id_fkey" FOREIGN KEY ("installment_plan_id") REFERENCES "ProductInstallmentPlan"("planId") ON DELETE RESTRICT ON UPDATE CASCADE;
