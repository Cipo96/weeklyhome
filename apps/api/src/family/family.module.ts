import { Module } from '@nestjs/common';
import { FamilyService } from './family.service.js';
import { FamilyController } from './family.controller.js';

@Module({
  providers: [FamilyService],
  controllers: [FamilyController],
  exports: [FamilyService],
})
export class FamilyModule {}
