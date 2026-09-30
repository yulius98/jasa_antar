import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PricingService } from '../pricing/pricing.service.js';
import { OrderStatus, PartnerStatus, UserRole } from '../generated/prisma/enums.js';
import type { AuthUser } from '../common/auth-user.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { AcceptOrderDto } from './dto/accept-order.dto.js';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto.js';
import { CancelOrderDto } from './dto/cancel-order.dto.js';
import { ListOrdersQuery } from './dto/list-orders.query.js';
import { CANCELLABLE_STATUSES, isValidTransition } from './order-status-flow.js';

const INCLUDE_DETAIL = {
  partner: { select: { id: true, rating: true, user: { select: { name: true, phone: true } } } },
  vehicle: { omit: { stnkPhotoUrl: true, photoUrl: true } },
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
} as const;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  // ---------- customer ----------

  async create(userId: string, dto: CreateOrderDto) {
    const customer = await this.prisma.customerProfile.findUnique({ where: { userId } });
    if (!customer) throw new NotFoundException('Profil customer tidak ditemukan');

    // Harga final dikunci dari hasil estimasi SAAT INI (tidak ada negosiasi).
    // Promo divalidasi ULANG di sini (bukan percaya hasil estimate sebelumnya),
    // karena kuota/masa berlakunya bisa berubah di antara estimasi dan checkout.
    const estimate = await this.pricing.estimate({
      pickupLatitude: dto.pickupLatitude,
      pickupLongitude: dto.pickupLongitude,
      dropoffLatitude: dto.dropoffLatitude,
      dropoffLongitude: dto.dropoffLongitude,
      vehicleType: dto.vehicleType,
      promoCode: dto.promoCode,
    });

    const order = await this.prisma.order.create({
      data: {
        orderNumber: this.generateOrderNumber(),
        customerId: customer.id,
        pickupAddress: dto.pickupAddress,
        pickupLatitude: dto.pickupLatitude,
        pickupLongitude: dto.pickupLongitude,
        dropoffAddress: dto.dropoffAddress,
        dropoffLatitude: dto.dropoffLatitude,
        dropoffLongitude: dto.dropoffLongitude,
        distanceKm: estimate.distanceKm,
        vehicleType: dto.vehicleType,
        itemDescription: dto.itemDescription,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        estimatedPrice: estimate.basePrice,
        finalPrice: estimate.finalPrice,
        discountAmount: estimate.discountAmount,
        promoCodeId: estimate.promo?.id,
        status: OrderStatus.PENDING,
        statusHistory: { create: { status: OrderStatus.PENDING } },
      },
      include: INCLUDE_DETAIL,
    });

    if (estimate.promo) {
      await this.pricing.incrementPromoUsage(estimate.promo.id);
    }
    return order;
  }

  async listMine(userId: string, query: ListOrdersQuery) {
    const customer = await this.prisma.customerProfile.findUnique({ where: { userId } });
    if (!customer) throw new NotFoundException('Profil customer tidak ditemukan');
    return this.paginate(
      { customerId: customer.id, ...(query.status ? { status: query.status } : {}) },
      query,
    );
  }

  // ---------- partner ----------

  // Daftar order PENDING yang tipe kendaraannya cocok dengan salah satu
  // kendaraan aktif milik partner ini. Partner harus APPROVED & online untuk melihatnya.
  async listAvailable(userId: string) {
    const partner = await this.prisma.partner.findUnique({
      where: { userId },
      include: { vehicles: { where: { isActive: true }, select: { type: true } } },
    });
    if (partner?.status !== PartnerStatus.APPROVED || !partner.isOnline) {
      throw new ForbiddenException('Kamu harus berstatus APPROVED dan online untuk melihat order');
    }
    const vehicleTypes = [...new Set(partner.vehicles.map((v) => v.type))];
    if (vehicleTypes.length === 0) return [];

    return this.prisma.order.findMany({
      where: { status: OrderStatus.PENDING, vehicleType: { in: vehicleTypes } },
      orderBy: { createdAt: 'asc' },
    });
  }

  // "Siapa cepat dia dapat": pakai updateMany dengan syarat status masih PENDING,
  // supaya dua partner yang klik bersamaan tidak bisa dua-duanya menang.
  async accept(userId: string, orderId: string, dto: AcceptOrderDto) {
    const partner = await this.prisma.partner.findUnique({ where: { userId } });
    if (partner?.status !== PartnerStatus.APPROVED) {
      throw new ForbiddenException('Akun partner belum disetujui');
    }

    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId } });
    if (vehicle?.partnerId !== partner.id || !vehicle.isActive) {
      throw new BadRequestException('Kendaraan tidak valid atau bukan milikmu');
    }

    const order = await this.findOrFail(orderId);
    if (order.vehicleType !== vehicle.type) {
      throw new BadRequestException('Tipe kendaraan tidak sesuai dengan order');
    }

    const result = await this.prisma.order.updateMany({
      where: { id: orderId, status: OrderStatus.PENDING },
      data: {
        partnerId: partner.id,
        vehicleId: vehicle.id,
        status: OrderStatus.DRIVER_ASSIGNED,
        confirmedAt: new Date(),
      },
    });
    if (result.count === 0) {
      // Antara findOrFail di atas dan updateMany ini, partner lain lebih dulu mengambilnya.
      throw new ConflictException('Order sudah diambil partner lain');
    }

    await this.prisma.orderStatusHistory.create({
      data: { orderId, status: OrderStatus.DRIVER_ASSIGNED },
    });
    return this.findOrFail(orderId);
  }

  async updateStatus(userId: string, orderId: string, dto: UpdateOrderStatusDto) {
    const order = await this.findOrFail(orderId);
    const partner = await this.prisma.partner.findUnique({ where: { userId } });
    if (partner?.id !== order.partnerId) {
      throw new ForbiddenException('Order ini bukan tanggung jawabmu');
    }
    if (!isValidTransition(order.status, dto.status)) {
      throw new BadRequestException(
        `Tidak bisa pindah dari status ${order.status} ke ${dto.status}`,
      );
    }

    const isCompleting = dto.status === OrderStatus.COMPLETED;
    const [updated] = await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: orderId },
        data: {
          status: dto.status,
          ...(isCompleting ? { completedAt: new Date() } : {}),
        },
        include: INCLUDE_DETAIL,
      }),
      this.prisma.orderStatusHistory.create({
        data: { orderId, status: dto.status, note: dto.note },
      }),
      ...(isCompleting
        ? [this.prisma.partner.update({ where: { id: partner.id }, data: { totalTrips: { increment: 1 } } })]
        : []),
    ]);
    return updated;
  }

  // ---------- customer & partner: cancel ----------

  async cancel(user: AuthUser, orderId: string, dto: CancelOrderDto) {
    const order = await this.findOrFail(orderId);
    await this.assertOwnership(user, order);

    if (!CANCELLABLE_STATUSES.includes(order.status)) {
      throw new BadRequestException(
        `Order berstatus ${order.status} tidak bisa dibatalkan (barang sudah mulai ditangani)`,
      );
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CANCELLED,
          cancelReason: dto.reason,
          cancelledBy: user.userId,
        },
        include: INCLUDE_DETAIL,
      });
      await tx.orderStatusHistory.create({
        data: { orderId, status: OrderStatus.CANCELLED, note: dto.reason },
      });
      return updated;
    });
  }

  // ---------- detail & admin ----------

  async detail(user: AuthUser, orderId: string) {
    const order = await this.findOrFail(orderId, INCLUDE_DETAIL);
    const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
    if (!isAdmin) await this.assertOwnership(user, order);
    return order;
  }

  async listAll(query: ListOrdersQuery) {
    return this.paginate(query.status ? { status: query.status } : {}, query);
  }

  // ---------- helper ----------

  private async paginate(where: Record<string, unknown>, query: ListOrdersQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { data, meta: { page, limit, total } };
  }

  private async findOrFail(id: string, include?: Record<string, unknown>) {
    const order = await this.prisma.order.findUnique({ where: { id }, include });
    if (!order) throw new NotFoundException('Order tidak ditemukan');
    return order;
  }

  private async assertOwnership(
    user: AuthUser,
    order: { customerId: string; partnerId: string | null },
  ) {
    if (user.role === UserRole.CUSTOMER) {
      const customer = await this.prisma.customerProfile.findUnique({
        where: { userId: user.userId },
      });
      if (customer?.id !== order.customerId) throw new ForbiddenException();
      return;
    }
    if (user.role === UserRole.PARTNER) {
      const partner = await this.prisma.partner.findUnique({ where: { userId: user.userId } });
      if (partner?.id !== order.partnerId) throw new ForbiddenException();
      return;
    }
    throw new ForbiddenException();
  }

  // Format: ORD-<basis36 waktu>-<6 hex acak>, contoh: ORD-M1A2B3C4-9F3D21
  // 6 hex (~16.7 juta kombinasi) dipilih supaya order yang dibuat dalam
  // milidetik yang sama (banyak request bersamaan) sangat kecil peluang bentrok.
  // Kolom orderNumber tetap @unique di schema sebagai jaring pengaman terakhir --
  // kalau tetap bentrok, Prisma akan melempar P2002 dan request itu perlu diulang.
  private generateOrderNumber(): string {
    const time = Date.now().toString(36).toUpperCase();
    const rand = randomBytes(3).toString('hex').toUpperCase();
    return `ORD-${time}-${rand}`;
  }
}
