import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserRole } from '../generated/prisma/enums.js';
import type { AuthUser } from '../common/auth-user.js';
import { ACTIVE_ORDER_STATUSES } from '../orders/order-status-flow.js';
import { SubmitLocationDto } from './dto/submit-location.dto.js';
import { TrackingHistoryQuery } from './dto/tracking-history.query.js';

@Injectable()
export class TrackingService {
  constructor(private prisma: PrismaService) {}

  // Partner mengirim titik lokasinya sendiri. Dipanggil berkala oleh app partner
  // (mis. setiap 10-15 detik) selama order masih "berjalan".
  async submitLocation(userId: string, dto: SubmitLocationDto) {
    const partner = await this.prisma.partner.findUnique({ where: { userId } });
    if (!partner) throw new ForbiddenException('Akun ini bukan partner');

    const order = await this.prisma.order.findUnique({ where: { id: dto.orderId } });
    if (!order) throw new NotFoundException('Order tidak ditemukan');
    if (order.partnerId !== partner.id) {
      throw new ForbiddenException('Order ini bukan tanggung jawabmu');
    }
    if (!ACTIVE_ORDER_STATUSES.includes(order.status)) {
      throw new BadRequestException(
        `Order berstatus ${order.status}, tidak sedang berjalan sehingga tidak menerima titik lokasi`,
      );
    }

    // Titik lokasi tersimpan sebagai histori (bukan cuma overwrite satu baris),
    // supaya rute perjalanan order bisa direplay nanti.
    const [point] = await this.prisma.$transaction([
      this.prisma.trackingPoint.create({
        data: {
          orderId: dto.orderId,
          partnerId: partner.id,
          latitude: dto.latitude,
          longitude: dto.longitude,
          speedKmh: dto.speedKmh,
        },
      }),
      this.prisma.partner.update({
        where: { id: partner.id },
        data: { currentLatitude: dto.latitude, currentLongitude: dto.longitude },
      }),
    ]);
    return point;
  }

  async latest(user: AuthUser, orderId: string) {
    const order = await this.findOrderOrFail(orderId);
    await this.assertOrderAccess(user, order);

    const point = await this.prisma.trackingPoint.findFirst({
      where: { orderId },
      orderBy: { recordedAt: 'desc' },
    });
    if (!point) throw new NotFoundException('Belum ada titik lokasi untuk order ini');
    return point;
  }

  async history(user: AuthUser, orderId: string, query: TrackingHistoryQuery) {
    const order = await this.findOrderOrFail(orderId);
    await this.assertOrderAccess(user, order);

    return this.prisma.trackingPoint.findMany({
      where: { orderId },
      orderBy: { recordedAt: 'asc' },
      take: query.limit ?? 500,
    });
  }

  private async findOrderOrFail(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order tidak ditemukan');
    return order;
  }

  // Sama seperti ownership check di orders.service.ts -- sengaja ditulis ulang
  // di sini (bukan impor silang) supaya modul tracking tidak bergantung pada
  // detail internal OrdersService.
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
