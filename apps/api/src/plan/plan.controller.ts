import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  ServiceUnavailableException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard, type JwtPayload } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { PlanService, type OverrideItemInput } from './plan.service.js';
import { generateMealVariants, type MealItemInput } from './variants.js';

interface SetOverrideBody {
  day?: number;
  type?: string;
  memberId?: string;
  items?: OverrideItemInput[];
}

interface UploadedPdf {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

@Controller('plan')
@UseGuards(AuthGuard)
export class PlanController {
  constructor(private readonly plan: PlanService) {}

  /**
   * Importa un piano. Accetta opzionalmente un PDF (campo multipart "file"):
   * con il PDF usa l'estrazione AI, senza usa il piano di esempio.
   */
  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  import(@CurrentUser() user: JwtPayload, @UploadedFile() file?: UploadedPdf) {
    return this.plan.importPlan(user.sub, file?.buffer);
  }

  @Post(':id/confirm')
  confirm(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body?: { validFrom?: string },
  ) {
    let validFrom: Date | undefined;
    if (body?.validFrom) {
      const d = new Date(body.validFrom);
      if (Number.isNaN(d.getTime())) throw new BadRequestException('validFrom non valida');
      validFrom = d;
    }
    return this.plan.confirm(user.sub, id, validFrom);
  }

  /** Genera varianti iso-macro di un pasto via AI. Richiede chiave AI. */
  @Post('variants')
  async variants(@Body() body: { items?: MealItemInput[] }) {
    if (!process.env.GEMINI_API_KEY) {
      throw new ServiceUnavailableException(
        'Varianti AI non disponibili: imposta GEMINI_API_KEY in apps/api/.env',
      );
    }
    const items = (body?.items ?? []).filter((it) => it?.name && it.value > 0 && it.unit);
    if (items.length === 0) throw new BadRequestException('items obbligatori');
    try {
      return { variants: await generateMealVariants(items) };
    } catch (e) {
      const msg = String(e);
      const overloaded = msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('429');
      throw new ServiceUnavailableException(
        overloaded
          ? 'Servizio AI momentaneamente occupato (o quota esaurita): riprova tra poco.'
          : 'Generazione varianti non riuscita.',
      );
    }
  }

  @Get('active')
  active(@CurrentUser() user: JwtPayload) {
    return this.plan.getActive(user.sub);
  }

  /** Bozza in revisione (dopo l'import, prima della conferma). */
  @Get('draft')
  draft(@CurrentUser() user: JwtPayload) {
    return this.plan.getDraft(user.sub);
  }

  /** Clona il piano attivo in bozza per modificarlo. */
  @Post('edit-active')
  editActive(@CurrentUser() user: JwtPayload) {
    return this.plan.editActivePlan(user.sub);
  }

  /** Modifica una voce della bozza (quantità/unità/nome). */
  @Patch('items/:itemId')
  updateItem(
    @CurrentUser() user: JwtPayload,
    @Param('itemId') itemId: string,
    @Body() body: { name?: string; value?: number; unit?: string },
  ) {
    return this.plan.updateDraftItem(user.sub, itemId, body ?? {});
  }

  /** Rimuove una voce della bozza. */
  @Delete('items/:itemId')
  deleteItem(@CurrentUser() user: JwtPayload, @Param('itemId') itemId: string) {
    return this.plan.deleteDraftItem(user.sub, itemId);
  }

  /** Aggiunge una voce a un pasto della bozza (opzionalmente a una specifica alternativa). */
  @Post('meals/:mealId/items')
  addItem(
    @CurrentUser() user: JwtPayload,
    @Param('mealId') mealId: string,
    @Body() body: { name?: string; value?: number; unit?: string; optionIndex?: number },
  ) {
    if (!body?.name || typeof body.value !== 'number' || !body.unit) {
      throw new BadRequestException('name, value e unit sono obbligatori');
    }
    return this.plan.addDraftItem(user.sub, mealId, {
      name: body.name,
      value: body.value,
      unit: body.unit,
      optionIndex: body.optionIndex,
    });
  }

  /** Imposta l'opzione (alternativa) pianificata di un pasto della bozza. */
  @Patch('meals/:mealId/option')
  selectOption(
    @CurrentUser() user: JwtPayload,
    @Param('mealId') mealId: string,
    @Body() body: { selectedOption?: number },
  ) {
    if (typeof body?.selectedOption !== 'number') {
      throw new BadRequestException('selectedOption (number) è obbligatorio');
    }
    return this.plan.selectMealOption(user.sub, mealId, body.selectedOption);
  }

  /** Imposta/sostituisce la correzione di un pasto (US-008). */
  @Post('overrides')
  setOverride(@CurrentUser() user: JwtPayload, @Body() body: SetOverrideBody) {
    const { day, type, items, memberId } = body ?? {};
    if (typeof day !== 'number' || !type || !Array.isArray(items)) {
      throw new BadRequestException('day, type e items sono obbligatori');
    }
    return this.plan.setOverride(user.sub, day, type, items, memberId);
  }

  /** Rimuove la correzione di un pasto. */
  @Delete('overrides')
  clearOverride(
    @CurrentUser() user: JwtPayload,
    @Query('day') day: string,
    @Query('type') type: string,
    @Query('memberId') memberId?: string,
  ) {
    if (day === undefined || !type) {
      throw new BadRequestException('day e type sono obbligatori');
    }
    return this.plan.clearOverride(user.sub, Number(day), type, memberId);
  }
}
