-- AlterTable
ALTER TABLE "Meal" ADD COLUMN     "selectedOption" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "MealItem" ADD COLUMN     "optionIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "optionLabel" TEXT;
