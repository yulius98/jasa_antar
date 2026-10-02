import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrderStatus, UserRole } from '../generated/prisma/enums.js';
import type { AuthUser } from '../common/auth-user.js';
import { CreateRatingDto } from './dto/create-rating.dto.js';
import { ListRatingsQuery } from './dto/list-ratings.query.js';

@Injectable()
export class RatingsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateRatingDto) {
    const customer = await this.prisma.customerProfile.findUnique({ where: { userId } });
    if (!customer) throw new NotFoundException('Profil customer tidak ditemukan');

    const order = await this.prisma.order.findUnique({ where: { id: dto.orderId } });
    if (!order) throw new NotFoundException('Order tidak ditemukan');
    if (order.customerId !== customer.id) {
      throw new ForbiddenException('Order ini bukan milikmu');
    }
    if (order.status !== OrderStatus.COMPLETED) {
      throw new BadRequestException('Order hanya bisa dinilai setelah berstatus COMPLETED');
    }
    if (!order.partnerId) {
      // Secara praktis tidak mungkin terjadi (order COMPLETED pasti sudah ada
      // partner yang mengerjakannya), tapi dijaga agar tidak membuat Rating yatim.
      throw new BadRequestException('Order ini tidak memiliki partner');
    }

    const existing = await this.prisma.rating.findUnique({ where: { orderId: dto.orderId } });
    if (existing) throw new ConflictException('Order ini sudah pernah dinilai');

    const rating = await this.prisma.rating.create({
      data: {
        orderId: dto.orderId,
        partnerId: order.partnerId,
        score: dto.score,
        comment: dto.comment,
      },
    });

    await this.recalculatePartnerRating(order.partnerId);
    return rating;
  }

  async listForPartner(partnerId: string, query: ListRatingsQuery) {
    const partner = await this.prisma.partner.findUnique({ where: { id: partnerId } });
    if (!partner) throw new NotFoundException('Partner tidak ditemukan');

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    // Komentar & skor ditampilkan tanpa identitas customer -- publik dalam arti
    // bisa dilihat siapa saja yang sudah login, bukan dossier per-customer.
    const [data, total] = await this.prisma.$transaction([
      this.prisma.rating.findMany({
        where: { partnerId },
        select: { id: true, score: true, comment: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.rating.count({ where: { partnerId } }),
    ]);
    return { data, meta: { page, limit, total, averageRating: partner.rating } };
  }

  async getForOrder(user: AuthUser, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order tidak ditemukan');
    await this.assertOrderAccess(user, order);

    const rating = await this.prisma.rating.findUnique({ where: { orderId } });
    if (!rating) throw new NotFoundException('Order ini belum dinilai');
    return rating;
  }

  // Dihitung ulang dari SEMUA rating partner (bukan incremental), supaya tetap
  // akurat walau ada moderasi/penghapusan rating oleh admin di masa depan.
  private async recalculatePartnerRating(partnerId: string) {
    const agg = await this.prisma.rating.aggregate({
      where: { partnerId },
      _avg: { score: true },
    });
    await this.prisma.partner.update({
      where: { id: partnerId },
      data: { rating: agg._avg.score ?? 0 },
    });
  }

  private async assertOrderAccess(
    user: AuthUser,
    order: { customerId: string; partnerId: string | null },
  ) {
    const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
    if (isAdmin) return;

    if (user.role === UserRole.CUSTOMER) {
      const customer = await this.prisma.customerProfile.findUnique({
        where: { userId: user.userId },
      });
      if (!customer || customer.id !== order.customerId) throw new ForbiddenException();
      return;
    }
    if (user.role === UserRole.PARTNER) {
      const partner = await this.prisma.partner.findUnique({ where: { userId: user.userId } });
      if (!partner || partner.id !== order.partnerId) throw new ForbiddenException();
      return;
    }
    throw new ForbiddenException();
  }
}
