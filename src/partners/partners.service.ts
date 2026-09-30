import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService, type UploadedFileData } from '../storage/storage.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { PartnerStatus, UserRole } from '../generated/prisma/enums.js';
import { PartnerDocumentType } from './partner-document-type.js';
import { ApplyPartnerDto } from './dto/apply-partner.dto.js';
import { ListPartnersQuery } from './dto/list-partners.query.js';

// Key file di storage tidak pernah dikirim ke client; dokumen hanya bisa
// diambil lewat endpoint khusus yang mengecek hak akses.
const OMIT_DOCS = { ktpPhotoUrl: true, simPhotoUrl: true } as const;
const OMIT_VEHICLE_FILES = { stnkPhotoUrl: true, photoUrl: true } as const;

@Injectable()
export class PartnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ---------- sisi calon partner / partner ----------

  async apply(
    userId: string,
    dto: ApplyPartnerDto,
    files: Record<string, UploadedFileData[]>,
  ) {
    const ktp = files?.ktpPhoto?.[0];
    const sim = files?.simPhoto?.[0];
    if (!ktp || !sim) {
      throw new BadRequestException('Foto KTP dan SIM wajib diunggah');
    }

    const existing = await this.prisma.partner.findUnique({
      where: { userId },
    });
    // Pendaftaran yang ditolak boleh diajukan ulang; selain itu tidak.
    if (existing && existing.status !== PartnerStatus.REJECTED) {
      throw new ConflictException('Kamu sudah mengajukan diri sebagai partner');
    }

    const duplicate = await this.prisma.partner.findFirst({
      where: {
        OR: [{ ktpNumber: dto.ktpNumber }, { simNumber: dto.simNumber }],
        ...(existing ? { NOT: { id: existing.id } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('Nomor KTP atau SIM sudah terdaftar');
    }

    const saved: string[] = [];
    try {
      const ktpKey = await this.storage.save(ktp, 'partners/ktp');
      saved.push(ktpKey);
      const simKey = await this.storage.save(sim, 'partners/sim');
      saved.push(simKey);

      const partner = existing
        ? await this.prisma.partner.update({
            where: { id: existing.id },
            data: {
              ktpNumber: dto.ktpNumber,
              ktpPhotoUrl: ktpKey,
              simNumber: dto.simNumber,
              simPhotoUrl: simKey,
              status: PartnerStatus.PENDING,
              rejectionReason: null,
              approvedBy: null,
              approvedAt: null,
            },
            omit: OMIT_DOCS,
          })
        : await this.prisma.partner.create({
            data: {
              userId,
              ktpNumber: dto.ktpNumber,
              ktpPhotoUrl: ktpKey,
              simNumber: dto.simNumber,
              simPhotoUrl: simKey,
            },
            omit: OMIT_DOCS,
          });

      // Pengajuan ulang: file lama sudah tidak dipakai
      if (existing) {
        await this.storage.remove(existing.ktpPhotoUrl);
        await this.storage.remove(existing.simPhotoUrl);
      }
      return partner;
    } catch (err) {
      await Promise.all(saved.map((key) => this.storage.remove(key)));
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException('Nomor KTP atau SIM sudah terdaftar');
      }
      throw err;
    }
  }

  async me(userId: string) {
    const partner = await this.prisma.partner.findUnique({
      where: { userId },
      omit: OMIT_DOCS,
      include: { vehicles: { omit: OMIT_VEHICLE_FILES } },
    });
    if (!partner) {
      throw new NotFoundException('Kamu belum mengajukan diri sebagai partner');
    }
    return partner;
  }

  async setOnline(userId: string, isOnline: boolean) {
    const partner = await this.prisma.partner.findUnique({ where: { userId } });
    if (partner?.status !== PartnerStatus.APPROVED) {
      throw new ForbiddenException(
        'Akun partner belum disetujui atau sedang disuspend',
      );
    }
    return this.prisma.partner.update({
      where: { id: partner.id },
      data: { isOnline },
      omit: OMIT_DOCS,
    });
  }

  // ---------- sisi admin ----------

  async list(query: ListPartnersQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = query.status ? { status: query.status } : {};

    const [data, total] = await this.prisma.$transaction([
      this.prisma.partner.findMany({
        where,
        omit: OMIT_DOCS,
        include: {
          user: { select: { name: true, email: true, phone: true } },
          _count: { select: { vehicles: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.partner.count({ where }),
    ]);
    return { data, meta: { page, limit, total } };
  }

  async detail(id: string) {
    const partner = await this.prisma.partner.findUnique({
      where: { id },
      omit: OMIT_DOCS,
      include: {
        user: { select: { name: true, email: true, phone: true } },
        vehicles: { omit: OMIT_VEHICLE_FILES },
      },
    });
    if (!partner) throw new NotFoundException('Partner tidak ditemukan');
    return partner;
  }

  async approve(id: string, adminUserId: string) {
    const partner = await this.findOrFail(id);
    if (partner.status === PartnerStatus.APPROVED) {
      throw new ConflictException('Partner sudah disetujui');
    }
    const activeVehicles = await this.prisma.vehicle.count({
      where: { partnerId: id, isActive: true },
    });
    if (activeVehicles === 0) {
      throw new BadRequestException('Partner belum mendaftarkan kendaraan');
    }

    // Status partner dan role user harus berubah bersamaan
    const [updated] = await this.prisma.$transaction([
      this.prisma.partner.update({
        where: { id },
        data: {
          status: PartnerStatus.APPROVED,
          approvedBy: adminUserId,
          approvedAt: new Date(),
          rejectionReason: null,
        },
        omit: OMIT_DOCS,
      }),
      this.prisma.user.update({
        where: { id: partner.userId },
        data: { role: UserRole.PARTNER },
      }),
    ]);
    return updated;
  }

  async reject(id: string, reason: string) {
    const partner = await this.findOrFail(id);
    if (partner.status !== PartnerStatus.PENDING) {
      throw new ConflictException(
        'Hanya pendaftaran berstatus PENDING yang bisa ditolak',
      );
    }
    return this.prisma.partner.update({
      where: { id },
      data: { status: PartnerStatus.REJECTED, rejectionReason: reason },
      omit: OMIT_DOCS,
    });
  }

  async suspend(id: string, reason: string) {
    const partner = await this.findOrFail(id);
    if (partner.status !== PartnerStatus.APPROVED) {
      throw new ConflictException(
        'Hanya partner berstatus APPROVED yang bisa disuspend',
      );
    }
    return this.prisma.partner.update({
      where: { id },
      data: {
        status: PartnerStatus.SUSPENDED,
        isOnline: false,
        rejectionReason: reason,
      },
      omit: OMIT_DOCS,
    });
  }

  // ---------- dokumen ----------

  async openDocument(id: string, type: PartnerDocumentType, user: AuthUser) {
    const partner = await this.findOrFail(id);
    const isAdmin =
      user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
    if (!isAdmin && partner.userId !== user.userId) {
      throw new ForbiddenException();
    }
    const key =
      type === PartnerDocumentType.KTP
        ? partner.ktpPhotoUrl
        : partner.simPhotoUrl;
    return this.storage.open(key);
  }

  private async findOrFail(id: string) {
    const partner = await this.prisma.partner.findUnique({ where: { id } });
    if (!partner) throw new NotFoundException('Partner tidak ditemukan');
    return partner;
  }
}
