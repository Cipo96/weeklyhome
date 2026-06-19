import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashPassword, verifyPassword } from './password.js';

interface UserRow {
  id: string;
  email: string;
  name: string;
  familyId: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(email: string, password: string, name: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email già registrata');
    const user = await this.prisma.user.create({
      data: { email, password: hashPassword(password), name },
    });
    return this.withToken(user);
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !verifyPassword(password, user.password)) {
      throw new UnauthorizedException('Credenziali non valide');
    }
    return this.withToken(user);
  }

  private async withToken(user: UserRow) {
    const token = await this.jwt.signAsync({ sub: user.id, email: user.email });
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        familyId: user.familyId,
      },
    };
  }
}
