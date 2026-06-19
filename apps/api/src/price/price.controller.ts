import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  ServiceUnavailableException,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../auth/auth.guard.js';
import { PriceService } from './price.service.js';
import type { VolantinoMediaType, VolantinoPage } from './volantino/volantino-extractor.js';

interface UploadedFileLike {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

function toMediaType(mimetype: string): VolantinoMediaType | null {
  if (mimetype === 'application/pdf') return 'application/pdf';
  if (mimetype === 'image/png') return 'image/png';
  if (mimetype === 'image/jpeg' || mimetype === 'image/jpg') return 'image/jpeg';
  return null;
}

@Controller('prices')
@UseGuards(AuthGuard)
export class PriceController {
  constructor(private readonly price: PriceService) {}

  @Get('stores')
  stores(@Query('radius') radius?: string) {
    return this.price.getStores(radius ? Number(radius) : undefined);
  }

  /** Ricerca prodotti nei volantini per nome o marca (sezione "Cerca"). */
  @Get('search')
  search(@Query('q') q?: string) {
    return this.price.searchProducts(q ?? '');
  }

  @Post('refresh')
  refresh() {
    return this.price.refresh();
  }

  /**
   * Recupero automatico delle offerte dal volantino Conad del punto vendita
   * (scoperta store → Yumpu → vision AI). Nessun upload. Richiede una chiave AI.
   */
  @Post('volantino/auto')
  refreshVolantino(@Query('force') force?: string) {
    if (!process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      throw new ServiceUnavailableException(
        'Estrazione volantino non disponibile: imposta GEMINI_API_KEY (o ANTHROPIC_API_KEY) in apps/api/.env',
      );
    }
    return this.price.refreshConadVolantino('conad', force === 'true');
  }

  /** Recupero automatico delle offerte dal volantino Todis (PDF). Richiede chiave AI. */
  @Post('volantino/todis')
  refreshTodisVolantino(@Query('force') force?: string) {
    if (!process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      throw new ServiceUnavailableException(
        'Estrazione volantino non disponibile: imposta GEMINI_API_KEY (o ANTHROPIC_API_KEY) in apps/api/.env',
      );
    }
    return this.price.refreshTodisVolantino('todis', force === 'true');
  }

  /**
   * Ingestione del volantino: carica una o più pagine (PDF o immagini) nel campo
   * multipart "files"; Claude vision estrae i prezzi e li salva per il negozio.
   */
  @Post('volantino')
  @UseInterceptors(FilesInterceptor('files', 30))
  ingestVolantino(
    @UploadedFiles() files: UploadedFileLike[],
    @Query('storeId') storeId?: string,
  ) {
    if (!process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      throw new ServiceUnavailableException(
        'Estrazione volantino non disponibile: imposta GEMINI_API_KEY (o ANTHROPIC_API_KEY) in apps/api/.env',
      );
    }
    if (!files || files.length === 0) {
      throw new BadRequestException('Carica almeno un file (PDF o immagini) nel campo "files"');
    }
    const pages: VolantinoPage[] = [];
    for (const f of files) {
      const mediaType = toMediaType(f.mimetype);
      if (!mediaType) {
        throw new BadRequestException(`Tipo file non supportato: ${f.mimetype} (${f.originalname})`);
      }
      pages.push({ data: f.buffer, mediaType });
    }
    return this.price.ingestVolantino(pages, storeId ?? 'conad');
  }
}
