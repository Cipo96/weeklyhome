import {
  Controller,
  ForbiddenException,
  Headers,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PriceService } from './price/price.service.js';

/**
 * Endpoint PUBBLICO (no JWT) per gli scheduler esterni tipo cron-job.org, che
 * non sanno autenticarsi con un token utente. Protetto da un segreto condiviso
 * CRON_SECRET passato come header `x-cron-token` o query `?token=`.
 *
 * Serve perché su Render free il @Cron in-process non è affidabile (il processo
 * dorme all'orario schedulato): lo scheduling "vero" vive fuori dal processo e
 * chiama questo endpoint una volta a settimana.
 */
@Controller('cron')
export class CronController {
  constructor(private readonly price: PriceService) {}

  private assertToken(token: string | undefined): void {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      throw new ServiceUnavailableException(
        'CRON_SECRET non configurato: imposta la variabile per abilitare i trigger esterni.',
      );
    }
    if (token !== secret) {
      throw new ForbiddenException('Token cron non valido.');
    }
  }

  /**
   * Refresh settimanale "di tutto": prezzi base HTTP (gratis) + volantini vision
   * (Conad + Todis). Fire-and-forget: risponde subito, il lavoro prosegue in
   * background (la vision supererebbe il timeout dello scheduler).
   */
  @Post('weekly')
  async weekly(
    @Headers('x-cron-token') headerToken?: string,
    @Query('token') queryToken?: string,
  ): Promise<{ started: boolean }> {
    this.assertToken(headerToken ?? queryToken);
    // Il refresh base è veloce: lo aspettiamo così l'esito va nei log dello scheduler.
    await this.price.refresh().catch(() => undefined);
    // La vision è lenta (minuti): avvio in background, non-force (rispetta validità).
    this.price.startVolantiniRefresh(false);
    return { started: true };
  }
}
