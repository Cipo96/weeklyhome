import { Global, Module } from '@nestjs/common';
import { PriceService } from './price.service.js';
import { PriceController } from './price.controller.js';
import { CategoryModule } from '../category/category.module.js';

@Global()
@Module({
  imports: [CategoryModule],
  providers: [PriceService],
  controllers: [PriceController],
  exports: [PriceService],
})
export class PriceModule {}
