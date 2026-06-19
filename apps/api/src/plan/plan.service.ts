import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { FamilyService } from '../family/family.service.js';
import { buildSampleMeals } from './sample-plan.js';
import { canonicalFoodId } from './extraction/food-catalog.js';
import { CategoryService } from '../category/category.service.js';
import { withAiRetry } from '../ai/retry.js';
import {
  createPdfExtractor,
  type ExtractedMeal,
  type PdfExtractor,
} from './extraction/pdf-extractor.js';

/** Forma normalizzata di un pasto pronto per la persistenza (con opzioni). */
interface NormalizedItem {
  foodId: string;
  name: string | null;
  value: number;
  unit: string;
  optionIndex: number;
  optionLabel: string | null;
}
interface NormalizedMeal {
  day: number;
  type: string;
  selectedOption: number;
  items: NormalizedItem[];
}

/** Porta un pasto estratto (Gemini/Claude/mock) alla forma con opzioni. */
function normalizeExtracted(m: ExtractedMeal): NormalizedMeal {
  return {
    day: m.day,
    type: m.type,
    selectedOption: 0,
    items: m.items.map((it) => ({
      foodId: it.foodId,
      name: it.name ?? null,
      value: it.value,
      unit: it.unit,
      optionIndex: it.optionIndex ?? 0,
      optionLabel: it.optionLabel ?? null,
    })),
  };
}

@Injectable()
export class PlanService {
  private readonly logger = new Logger(PlanService.name);
  private readonly extractor: PdfExtractor = createPdfExtractor();

  constructor(
    private readonly prisma: PrismaService,
    private readonly family: FamilyService,
    private readonly category: CategoryService,
  ) {}

  /**
   * Importa un piano e lo salva in stato REVIEW.
   * Con un PDF usa l'estrattore (Claude o mock); senza, usa il piano di esempio.
   */
  async importPlan(userId: string, pdf?: Buffer) {
    const familyId = await this.family.requireFamilyId(userId);

    // In revisione teniamo il piano COSÌ COM'È estratto (es. una giornata-tipo):
    // l'eventuale replica sui 7 giorni avviene alla conferma.
    const meals: NormalizedMeal[] = pdf
      ? (
          await withAiRetry(() => this.extractor.extract(pdf), {
            label: 'Estrazione piano PDF',
            logger: this.logger,
          })
        ).map(normalizeExtracted)
      : buildSampleMeals().map((m) => ({
          day: m.day,
          type: m.type,
          selectedOption: m.selectedOption ?? 0,
          items: m.items.map((it) => ({
            foodId: it.foodId,
            name: null,
            value: it.value,
            unit: it.unit,
            optionIndex: it.optionIndex ?? 0,
            optionLabel: it.optionLabel ?? null,
          })),
        }));

    // Categoria canonica per ogni item (dict→cache→AI batch): una sola passata.
    const catByName = await this.category.categorizeMany(
      meals.flatMap((m) => m.items.map((it) => it.name ?? it.foodId)),
    );
    const catOf = (it: NormalizedItem) => catByName.get(it.name ?? it.foodId) ?? null;

    return this.prisma.plan.create({
      data: {
        familyId,
        status: 'REVIEW',
        meals: {
          create: meals.map((m) => ({
            day: m.day,
            type: m.type,
            selectedOption: m.selectedOption,
            items: {
              create: m.items.map((it) => ({
                foodId: it.foodId,
                name: it.name,
                value: it.value,
                unit: it.unit,
                optionIndex: it.optionIndex,
                optionLabel: it.optionLabel,
                category: catOf(it),
              })),
            },
          })),
        },
      },
      include: { meals: { include: { items: true } } },
    });
  }

  /** Ultimo piano in REVIEW (bozza da revisionare dopo l'import). */
  async getDraft(userId: string) {
    const familyId = await this.family.requireFamilyId(userId);
    return this.prisma.plan.findFirst({
      where: { familyId, status: 'REVIEW' },
      orderBy: { createdAt: 'desc' },
      include: { meals: { include: { items: true }, orderBy: [{ day: 'asc' }, { type: 'asc' }] } },
    });
  }

  /** Carica una voce verificando che appartenga a un piano REVIEW del nucleo. */
  private async requireEditableItem(userId: string, itemId: string) {
    const familyId = await this.family.requireFamilyId(userId);
    const item = await this.prisma.mealItem.findUnique({
      where: { id: itemId },
      include: { meal: { include: { plan: true } } },
    });
    if (!item || item.meal.plan.familyId !== familyId) {
      throw new NotFoundException('Voce non trovata');
    }
    if (item.meal.plan.status !== 'REVIEW') {
      throw new BadRequestException('Il piano non è più in revisione');
    }
    return item;
  }

  /** Aggiorna una voce della bozza (quantità, unità, nome → ri-mappa il foodId). */
  async updateDraftItem(
    userId: string,
    itemId: string,
    patch: { name?: string; value?: number; unit?: string },
  ) {
    const item = await this.requireEditableItem(userId, itemId);
    const name = patch.name ?? item.name ?? undefined;
    await this.prisma.mealItem.update({
      where: { id: itemId },
      data: {
        name: patch.name ?? item.name,
        value: patch.value ?? item.value,
        unit: patch.unit ?? item.unit,
        // se cambia il nome, ri-aggancia l'alimento canonico e la categoria per i prezzi
        foodId: patch.name ? canonicalFoodId(name!) : item.foodId,
        category: patch.name ? await this.category.categoryFor(name!) : item.category,
      },
    });
    return this.getDraft(userId);
  }

  /** Rimuove una voce dalla bozza. */
  async deleteDraftItem(userId: string, itemId: string) {
    await this.requireEditableItem(userId, itemId);
    await this.prisma.mealItem.delete({ where: { id: itemId } });
    return this.getDraft(userId);
  }

  /** Carica un pasto verificando che appartenga a un piano REVIEW del nucleo. */
  private async requireEditableMeal(userId: string, mealId: string) {
    const familyId = await this.family.requireFamilyId(userId);
    const meal = await this.prisma.meal.findUnique({
      where: { id: mealId },
      include: { plan: true, items: true },
    });
    if (!meal || meal.plan.familyId !== familyId) throw new NotFoundException('Pasto non trovato');
    if (meal.plan.status !== 'REVIEW') {
      throw new BadRequestException('Il piano non è più in revisione');
    }
    return meal;
  }

  /** Aggiunge una voce a un pasto della bozza (all'opzione indicata o a quella
   * selezionata), così l'item compare nell'alternativa giusta. */
  async addDraftItem(
    userId: string,
    mealId: string,
    body: { name: string; value: number; unit: string; optionIndex?: number },
  ) {
    const meal = await this.requireEditableMeal(userId, mealId);
    await this.prisma.mealItem.create({
      data: {
        mealId,
        foodId: canonicalFoodId(body.name),
        name: body.name,
        value: body.value,
        unit: body.unit,
        optionIndex: body.optionIndex ?? meal.selectedOption,
        category: await this.category.categoryFor(body.name),
      },
    });
    return this.getDraft(userId);
  }

  /** Imposta l'opzione (alternativa) pianificata di un pasto della bozza. */
  async selectMealOption(userId: string, mealId: string, selectedOption: number) {
    const meal = await this.requireEditableMeal(userId, mealId);
    const available = new Set(meal.items.map((it) => it.optionIndex));
    if (!available.has(selectedOption)) {
      throw new BadRequestException(`Opzione ${selectedOption} inesistente per questo pasto`);
    }
    await this.prisma.meal.update({ where: { id: mealId }, data: { selectedOption } });
    return this.getDraft(userId);
  }

  /** Conferma un piano rivisto: (se giornata-tipo) lo espande sui 7 giorni, lo
   * attiva con la data di inizio `validFrom` (default oggi) e ARCHIVIA il piano
   * attivo precedente chiudendone la validità al giorno prima → storico periodi. */
  async confirm(userId: string, planId: string, validFrom?: Date) {
    const familyId = await this.family.requireFamilyId(userId);
    const plan = await this.prisma.plan.findUnique({
      where: { id: planId },
      include: { meals: { include: { items: true } } },
    });
    if (!plan || plan.familyId !== familyId) {
      throw new NotFoundException('Piano non trovato');
    }

    // espansione giornata-tipo → 7 giorni (se il piano ha un solo giorno)
    const days = new Set(plan.meals.map((m) => m.day));
    if (days.size === 1 && plan.meals.length > 0) {
      const template = plan.meals;
      for (let d = 1; d <= 6; d++) {
        for (const m of template) {
          await this.prisma.meal.create({
            data: {
              planId,
              day: d,
              type: m.type,
              selectedOption: m.selectedOption,
              items: {
                create: m.items.map((it) => ({
                  foodId: it.foodId,
                  name: it.name,
                  value: it.value,
                  unit: it.unit,
                  optionIndex: it.optionIndex,
                  optionLabel: it.optionLabel,
                  category: it.category,
                })),
              },
            },
          });
        }
      }
    }

    const from = validFrom ?? new Date();
    // chiudi il piano precedente al giorno prima dell'inizio del nuovo
    const previousValidTo = new Date(from);
    previousValidTo.setDate(previousValidTo.getDate() - 1);
    await this.prisma.plan.updateMany({
      where: { familyId, status: 'ACTIVE' },
      data: { status: 'ARCHIVED', validTo: previousValidTo },
    });
    return this.prisma.plan.update({
      where: { id: planId },
      data: { status: 'ACTIVE', validFrom: from, validTo: null },
      include: { meals: { include: { items: true } } },
    });
  }

  async getActive(userId: string) {
    const familyId = await this.family.requireFamilyId(userId);
    return this.prisma.plan.findFirst({
      where: { familyId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      include: {
        meals: { include: { items: true } },
        overrides: { include: { items: true } },
      },
    });
  }

  private async requireActivePlanId(userId: string): Promise<string> {
    const familyId = await this.family.requireFamilyId(userId);
    const plan = await this.prisma.plan.findFirst({
      where: { familyId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!plan) throw new NotFoundException('Nessun piano attivo');
    return plan.id;
  }

  /** Imposta/sostituisce la correzione di un pasto (US-008). */
  async setOverride(
    userId: string,
    day: number,
    type: string,
    items: OverrideItemInput[],
    memberId?: string,
  ) {
    const planId = await this.requireActivePlanId(userId);
    await this.prisma.mealOverride.deleteMany({
      where: { planId, day, type, memberId: memberId ?? null },
    });
    // Categoria per gli item con nome (sostituzione manuale), in un'unica passata.
    const catByName = await this.category.categorizeMany(
      items.map((it) => it.name).filter((n): n is string => !!n),
    );
    await this.prisma.mealOverride.create({
      data: {
        planId,
        day,
        type,
        memberId: memberId ?? null,
        items: {
          // Per gli item inseriti a mano (sostituzione manuale) il client può
          // mandare solo il nome: deriviamo il foodId dal catalogo come all'import.
          create: items.map((it) => ({
            foodId: it.foodId ?? canonicalFoodId(it.name ?? ''),
            name: it.name ?? null,
            value: it.value,
            unit: it.unit,
            category: it.name ? (catByName.get(it.name) ?? null) : null,
          })),
        },
      },
    });
    return this.getActive(userId);
  }

  /** Rimuove la correzione di un pasto (torna all'originale). */
  async clearOverride(userId: string, day: number, type: string, memberId?: string) {
    const planId = await this.requireActivePlanId(userId);
    await this.prisma.mealOverride.deleteMany({
      where: { planId, day, type, memberId: memberId ?? null },
    });
    return this.getActive(userId);
  }
}

export interface OverrideItemInput {
  /** Se assente, viene derivato dal `name` via catalogo (item inseriti a mano). */
  foodId?: string;
  name?: string;
  value: number;
  unit: string;
}
