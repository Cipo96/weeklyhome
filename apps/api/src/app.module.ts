import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module.js';
import { CategoryModule } from './category/category.module.js';
import { AuthModule } from './auth/auth.module.js';
import { FamilyModule } from './family/family.module.js';
import { PlanModule } from './plan/plan.module.js';
import { PriceModule } from './price/price.module.js';
import { ShoppingModule } from './shopping/shopping.module.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    CategoryModule,
    AuthModule,
    FamilyModule,
    PlanModule,
    PriceModule,
    ShoppingModule,
  ],
})
export class AppModule {}
