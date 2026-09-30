import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserRole } from '../generated/prisma/enums.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { LoginThrottleService } from './login-throttle.service.js';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private loginThrottle: LoginThrottleService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { phone: dto.phone }] },
      select: { id: true },
    });
    if (exists) {
      throw new ConflictException('Email atau nomor telepon sudah terdaftar');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        role: UserRole.CUSTOMER,
        customerProfile: { create: {} },
      },
    });

    return {
      user: this.publicUser(user),
      ...(await this.issueTokens(user.id, user.role)),
    };
  }

  async login(dto: LoginDto) {
    // Cek lockout SEBELUM query & bcrypt, supaya percobaan brute-force
    // saat terkunci tidak ikut membebani database/CPU.
    this.loginThrottle.checkAllowed(dto.email);

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    const valid = user && (await bcrypt.compare(dto.password, user.passwordHash));
    if (!user || !valid || !user.isActive) {
      this.loginThrottle.registerFailure(dto.email);
      throw new UnauthorizedException('Email atau password salah');
    }

    this.loginThrottle.registerSuccess(dto.email);
    return {
      user: this.publicUser(user),
      ...(await this.issueTokens(user.id, user.role)),
    };
  }

  // Refresh token rotation: token lama dihapus, token baru diterbitkan.
  async refresh(rawToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: this.hash(rawToken) },
      include: { user: true },
    });
    if (!stored) throw new UnauthorizedException('Refresh token tidak valid');

    await this.prisma.refreshToken.delete({ where: { id: stored.id } });

    if (stored.expiresAt < new Date() || !stored.user.isActive) {
      throw new UnauthorizedException('Refresh token tidak valid');
    }
    return this.issueTokens(stored.userId, stored.user.role);
  }

  async logout(rawToken: string) {
    await this.prisma.refreshToken.deleteMany({
      where: { token: this.hash(rawToken) },
    });
    return { message: 'Logout berhasil' };
  }

  async me(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isVerified: true,
        createdAt: true,
      },
    });
  }

  private async issueTokens(userId: string, role: UserRole) {
    const accessToken = await this.jwt.signAsync({ sub: userId, role });

    // Refresh token acak; yang disimpan di DB hanya hash-nya.
    const refreshToken = randomBytes(48).toString('hex');
    const days = Number(this.config.get('REFRESH_TOKEN_DAYS') ?? 7);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        token: this.hash(refreshToken),
        expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      },
    });

    return { accessToken, refreshToken };
  }

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private publicUser(user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
  }) {
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }
}
