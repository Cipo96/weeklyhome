import {
  Controller,
  ForbiddenException,
  Get,
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
    @Query('force') force?: string,
  ): Promise<{ started: boolean; force: boolean }> {
    this.assertToken(headerToken ?? queryToken);
    // Il refresh base è veloce: lo aspettiamo così l'esito va nei log dello scheduler.
    await this.price.refresh().catch(() => undefined);
    // La vision è lenta (minuti): avvio in background. Di norma non-force, così
    // rispetta la validità e non spreca quota; force=true serve al rilancio
    // manuale quando si sospetta un'estrazione andata male ma non scaduta.
    const forced = force === 'true';
    this.price.startVolantiniRefresh(forced);
    return { started: true, force: forced };
  }

  /**
   * Esito del refresh, per lo scheduler che ha chiamato /cron/weekly. Serve
   * perché quella POST è fire-and-forget: risponde `started` prima ancora che
   * la vision parta, quindi da sola non distingue un successo da un disastro.
   * Lo scheduler fa polling qui finché `ok` diventa true (o scade il timeout).
   *
   * `aiKeyConfigured` è solo un booleano — la chiave non esce mai da qui.
   */
  @Get('status')
  async status(
    @Headers('x-cron-token') headerToken?: string,
    @Query('token') queryToken?: string,
  ) {
    this.assertToken(headerToken ?? queryToken);
    return this.price.volantiniStatus();
  }
}
