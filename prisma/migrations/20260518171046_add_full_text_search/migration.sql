-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "search_vector" tsvector;

-- Create update function and trigger
CREATE OR REPLACE FUNCTION product_search_trigger() RETURNS trigger AS $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.description, '')), 'B');
  return new;
end
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS product_search_update ON "Product";
CREATE TRIGGER product_search_update BEFORE INSERT OR UPDATE ON "Product"
FOR EACH ROW EXECUTE FUNCTION product_search_trigger();

-- Backfill existing products
UPDATE "Product" SET search_vector = 
  setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'B');

-- Create GIN index
CREATE INDEX IF NOT EXISTS product_search_idx ON "Product" USING gin(search_vector);

