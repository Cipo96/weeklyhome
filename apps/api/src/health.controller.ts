import { Controller, Get } from '@nestjs/common';

/**
 * Endpoint pubblico (no auth) per health-check e keep-alive.
 * Su Render free serve a tenere sveglio il processo (ping ogni ~10 min da
 * un cron esterno tipo cron-job.org), così il @Cron interno dei prezzi scatta.
 */
@Controller('health')
export class HealthController {
  @Get()
  check(): { ok: true; uptime: number; ts: string } {
    return { ok: true, uptime: process.uptime(), ts: new Date().toISOString() };
  }
}
