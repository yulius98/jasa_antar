import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PromoType, VehicleType } from '../generated/prisma/enums.js';
import { haversineDistanceKm } from './strategies/haversine.strategy.js';
import { EstimatePriceDto } from './dto/estimate-price.dto.js';
import { CreatePricingZoneDto } from './dto/create-pricing-zone.dto.js';
import { UpdatePricingZoneDto } from './dto/update-pricing-zone.dto.js';
import { CreatePromoDto } from './dto/create-promo.dto.js';
import { UpdatePromoDto } from './dto/update-promo.dto.js';

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- estimasi harga ----------

  async estimate(dto: EstimatePriceDto) {
    const distanceKm = haversineDistanceKm(
      dto.pickupLatitude,
      dto.pickupLongitude,
      dto.dropoffLatitude,
      dto.dropoffLongitude,
    );

    const zone = await this.prisma.pricingZone.findFirst({
      where: { vehicleType: dto.vehicleType, isActive: true },
      // Zona bisa lebih dari satu per tipe kendaraan (misal per kota);
      // untuk MVP kita pakai yang paling baru dibuat.
      orderBy: { createdAt: 'desc' },
    });
    if (!zone) {
      throw new NotFoundException(
        `Belum ada tarif aktif untuk tipe kendaraan ${dto.vehicleType}`,
      );
    }

    const billedDistanceKm = Math.max(distanceKm, Number(zone.minDistance));
    const basePrice =
      Number(zone.baseFare) + Number(zone.perKmRate) * billedDistanceKm;

    let discountAmount = 0;
    let appliedPromo: { code: string; id: string } | null = null;
    if (dto.promoCode) {
      const promo = await this.validatePromoForAmount(dto.promoCode, basePrice);
      discountAmount = this.calculateDiscount(promo, basePrice);
      appliedPromo = { code: promo.code, id: promo.id };
    }

    const finalPrice = Math.max(basePrice - discountAmount, 0);

    return {
      distanceKm: Number(distanceKm.toFixed(2)),
      billedDistanceKm: Number(billedDistanceKm.toFixed(2)),
      vehicleType: dto.vehicleType,
      zoneId: zone.id,
      basePrice: Math.round(basePrice),
      discountAmount: Math.round(discountAmount),
      finalPrice: Math.round(finalPrice),
      promo: appliedPromo,
    };
  }

  // Dipanggil terpisah oleh modul orders nanti saat order benar-benar dibuat,
  // supaya validitas promo dicek ulang (bukan cuma dipercaya dari hasil estimate sebelumnya).
  async validatePromoForAmount(code: string, orderAmount: number) {
    const promo = await this.prisma.promoCode.findUnique({
      where: { code: code.toUpperCase() },
    });
    const now = new Date();

    if (
      !promo ||
      !promo.isActive ||
      now < promo.validFrom ||
      now > promo.validUntil ||
      (promo.usageLimit !== null && promo.usedCount >= promo.usageLimit)
    ) {
      throw new BadRequestException(
        'Kode promo tidak valid atau sudah tidak berlaku',
      );
    }
    if (promo.minOrderValue && orderAmount < Number(promo.minOrderValue)) {
      throw new BadRequestException(
        `Kode promo hanya berlaku untuk order minimal Rp${Number(promo.minOrderValue).toLocaleString('id-ID')}`,
      );
    }
    return promo;
  }

  calculateDiscount(
    promo: { type: PromoType; value: unknown; maxDiscount: unknown },
    amount: number,
  ): number {
    const value = Number(promo.value);
    const raw =
      promo.type === PromoType.PERCENTAGE ? (amount * value) / 100 : value;
    const cap = promo.maxDiscount ? Number(promo.maxDiscount) : Infinity;
    return Math.min(raw, cap, amount);
  }

  // Dipanggil modul orders setelah order dengan promo berhasil dibuat
  async incrementPromoUsage(promoId: string) {
    await this.prisma.promoCode.update({
      where: { id: promoId },
      data: { usedCount: { increment: 1 } },
    });
  }

  // ---------- admin: pricing zones ----------

  async createZone(dto: CreatePricingZoneDto) {
    return this.prisma.pricingZone.create({ data: dto });
  }

  async listZones(vehicleType?: VehicleType) {
    return this.prisma.pricingZone.findMany({
      where: vehicleType ? { vehicleType } : {},
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateZone(id: string, dto: UpdatePricingZoneDto) {
    await this.findZoneOrFail(id);
    return this.prisma.pricingZone.update({ where: { id }, data: dto });
  }

  async deactivateZone(id: string) {
    await this.findZoneOrFail(id);
    return this.prisma.pricingZone.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private async findZoneOrFail(id: string) {
    const zone = await this.prisma.pricingZone.findUnique({ where: { id } });
    if (!zone) throw new NotFoundException('Zona tarif tidak ditemukan');
    return zone;
  }

  // ---------- admin: promo codes ----------

  async createPromo(dto: CreatePromoDto) {
    const validFrom = new Date(dto.validFrom);
    const validUntil = new Date(dto.validUntil);
    if (validUntil <= validFrom) {
      throw new BadRequestException('validUntil harus setelah validFrom');
    }

    const code = dto.code.toUpperCase();
    const exists = await this.prisma.promoCode.findUnique({ where: { code } });
    if (exists) throw new ConflictException('Kode promo sudah dipakai');

    return this.prisma.promoCode.create({
      data: { ...dto, code, validFrom, validUntil },
    });
  }

  async listPromos() {
    return this.prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async updatePromo(id: string, dto: UpdatePromoDto) {
    const promo = await this.prisma.promoCode.findUnique({ where: { id } });
    if (!promo) throw new NotFoundException('Kode promo tidak ditemukan');

    const validFrom = dto.validFrom ? new Date(dto.validFrom) : promo.validFrom;
    const validUntil = dto.validUntil
      ? new Date(dto.validUntil)
      : promo.validUntil;
    if (validUntil <= validFrom) {
      throw new BadRequestException('validUntil harus setelah validFrom');
    }

    return this.prisma.promoCode.update({
      where: { id },
      data: { ...dto, validFrom, validUntil },
    });
  }
}
