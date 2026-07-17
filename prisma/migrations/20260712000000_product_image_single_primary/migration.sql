-- Enforce at most ONE primary image per product at the database level.
-- This is the only guarantee that survives concurrent uploads, retries, and
-- regressions in any code path that writes isPrimary (upload / setPrimary /
-- removeGalleryImage). Mirrors the partial-unique pattern used for
-- PaymentIntent reservation keys.

-- Fails if the existing data already has >1 primary per product; clean up
-- duplicates first (keep the lowest sortOrder as primary per product).
CREATE UNIQUE INDEX "product_image_one_primary"
ON "ProductImage" ("productId")
WHERE "is_primary" = true;
