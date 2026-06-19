import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class FamilyService {
  constructor(private readonly prisma: PrismaService) {}

  async createFamily(userId: string, name: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utente non trovato');
    if (user.familyId) throw new BadRequestException('Sei già in un nucleo');

    return this.prisma.family.create({
      data: {
        name,
        inviteCode: randomBytes(4).toString('hex'),
        users: { connect: { id: userId } },
        members: { create: { name: user.name, doseFactor: 1 } },
      },
      include: { members: true },
    });
  }

  async join(userId: string, inviteCode: string) {
    const family = await this.prisma.family.findUnique({ where: { inviteCode } });
    if (!family) throw new NotFoundException('Codice invito non valido');
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { familyId: family.id },
    });
    await this.prisma.member.create({
      data: { name: user.name, doseFactor: 1, familyId: family.id },
    });
    return this.getFamily(userId);
  }

  async getFamily(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.familyId) return null;
    return this.prisma.family.findUnique({
      where: { id: user.familyId },
      include: { members: true },
    });
  }

  async requireFamilyId(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.familyId) {
      throw new BadRequestException('Nessun nucleo: crea o unisciti a una famiglia');
    }
    return user.familyId;
  }

  async addMember(userId: string, name: string, doseFactor: number) {
    const familyId = await this.requireFamilyId(userId);
    return this.prisma.member.create({ data: { name, doseFactor, familyId } });
  }

  async updateMember(userId: string, memberId: string, doseFactor: number) {
    const familyId = await this.requireFamilyId(userId);
    const member = await this.prisma.member.findUnique({ where: { id: memberId } });
    if (!member || member.familyId !== familyId) {
      throw new ForbiddenException('Membro non appartenente al tuo nucleo');
    }
    return this.prisma.member.update({
      where: { id: memberId },
      data: { doseFactor },
    });
  }
}
