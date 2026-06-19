import { Module } from '@nestjs/common';
import { FamilyModule } from '../family/family.module.js';
import { PlanModule } from '../plan/plan.module.js';
import { ShoppingService } from './shopping.service.js';
import { ShoppingController } from './shopping.controller.js';

@Module({
  imports: [FamilyModule, PlanModule],
  providers: [ShoppingService],
  controllers: [ShoppingController],
})
export class ShoppingModule {}
