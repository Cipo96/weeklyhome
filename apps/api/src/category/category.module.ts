import { Global, Module } from '@nestjs/common';
import { CategoryService } from './category.service.js';

@Global()
@Module({
  providers: [CategoryService],
  exports: [CategoryService],
})
export class CategoryModule {}
