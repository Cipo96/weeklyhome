-- CreateTable
CREATE TABLE "VolantinoProduct" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "quantityValue" DOUBLE PRECISION NOT NULL,
    "quantityUnit" TEXT NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "foodId" TEXT,
    "source" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),

    CONSTRAINT "VolantinoProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VolantinoProduct_storeId_idx" ON "VolantinoProduct"("storeId");

-- CreateIndex
CREATE INDEX "VolantinoProduct_foodId_idx" ON "VolantinoProduct"("foodId");

-- CreateIndex
CREATE INDEX "VolantinoProduct_name_idx" ON "VolantinoProduct"("name");

-- AddForeignKey
ALTER TABLE "VolantinoProduct" ADD CONSTRAINT "VolantinoProduct_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
