import { Module } from '@nestjs/common';
import { FamilyModule } from '../family/family.module.js';
import { CategoryModule } from '../category/category.module.js';
import { PlanService } from './plan.service.js';
import { PlanController } from './plan.controller.js';

@Module({
  imports: [FamilyModule, CategoryModule],
  providers: [PlanService],
  controllers: [PlanController],
  exports: [PlanService],
})
export class PlanModule {}
