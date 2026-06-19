import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { categorizeStatic } from '../plan/extraction/food-catalog.js';
import { resolveCategories } from './resolve.js';
import { aiCategorize } from './ai-categorizer.js';

@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Categorizza più nomi (dict→cache→AI batch). Mappa indicizzata per nome originale. */
  async categorizeMany(names: string[]): Promise<Map<string, string | null>> {
    return resolveCategories(names, {
      staticLookup: (name) => categorizeStatic(name),
      cacheLookup: async (norms) => {
        const rows = await this.prisma.nameCategory.findMany({
          where: { nameNorm: { in: norms } },
        });
        return new Map(rows.map((r) => [r.nameNorm, r.category]));
      },
      aiResolve: (n) => aiCategorize(n),
      persist: async (entries) => {
        if (entries.length === 0) return;
        await this.prisma.nameCategory.createMany({ data: entries, skipDuplicates: true });
      },
    });
  }

  /** Categoria di un singolo nome. */
  async categoryFor(name: string): Promise<string | null> {
    const m = await this.categorizeMany([name]);
    return m.get(name) ?? null;
  }
}
