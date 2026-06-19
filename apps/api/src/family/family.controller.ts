import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, type JwtPayload } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { FamilyService } from './family.service.js';

@Controller('family')
@UseGuards(AuthGuard)
export class FamilyController {
  constructor(private readonly family: FamilyService) {}

  @Get()
  get(@CurrentUser() user: JwtPayload) {
    return this.family.getFamily(user.sub);
  }

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() body: { name?: string }) {
    if (!body?.name) throw new BadRequestException('name obbligatorio');
    return this.family.createFamily(user.sub, body.name);
  }

  @Post('join')
  join(@CurrentUser() user: JwtPayload, @Body() body: { inviteCode?: string }) {
    if (!body?.inviteCode) throw new BadRequestException('inviteCode obbligatorio');
    return this.family.join(user.sub, body.inviteCode);
  }

  @Post('members')
  addMember(
    @CurrentUser() user: JwtPayload,
    @Body() body: { name?: string; doseFactor?: number },
  ) {
    if (!body?.name) throw new BadRequestException('name obbligatorio');
    return this.family.addMember(user.sub, body.name, body.doseFactor ?? 1);
  }

  @Patch('members/:id')
  updateMember(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { doseFactor?: number },
  ) {
    if (typeof body?.doseFactor !== 'number') {
      throw new BadRequestException('doseFactor numerico obbligatorio');
    }
    return this.family.updateMember(user.sub, id, body.doseFactor);
  }
}
