import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, type JwtPayload } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ShoppingService } from './shopping.service.js';

@Controller('shopping')
@UseGuards(AuthGuard)
export class ShoppingController {
  constructor(private readonly shopping: ShoppingService) {}

  @Get()
  compute(
    @CurrentUser() user: JwtPayload,
    @Query('mode') mode?: string,
    @Query('radius') radius?: string,
    @Query('lat') lat?: string,
    @Query('lon') lon?: string,
  ) {
    const pos =
      lat && lon && Number.isFinite(Number(lat)) && Number.isFinite(Number(lon))
        ? { lat: Number(lat), lon: Number(lon) }
        : undefined;
    return this.shopping.compute(
      user.sub,
      mode === 'fewest' ? 'fewest' : 'cheapest',
      radius ? Number(radius) : undefined,
      pos,
    );
  }
}
