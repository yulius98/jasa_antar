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
import { CreateVehicleDto } from './dto/create-vehicle.dto.js';
import { VehicleFileKind } from './vehicle-file-kind.js';

const OMIT_FILES = { stnkPhotoUrl: true, photoUrl: true } as const;

@Injectable()
export class VehiclesService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  async create(
    userId: string,
    dto: CreateVehicleDto,
    files: Record<string, UploadedFileData[]>,
  ) {
    const stnk = files?.stnkPhoto?.[0];
    const photo = files?.photo?.[0];
    if (!stnk) throw new BadRequestException('Foto STNK wajib diunggah');

    const partner = await this.prisma.partner.findUnique({ where: { userId } });
    if (!partner) {
      throw new ForbiddenException('Ajukan diri sebagai partner terlebih dahulu');
    }
    // Kendaraan boleh ditambahkan saat PENDING (syarat persetujuan) atau APPROVED
    if (partner.status !== PartnerStatus.PENDING && partner.status !== PartnerStatus.APPROVED) {
      throw new ForbiddenException('Status partner tidak memungkinkan menambah kendaraan');
    }

    const taken = await this.prisma.vehicle.findUnique({
      where: { plateNumber: dto.plateNumber },
      select: { id: true },
    });
    if (taken) throw new ConflictException('Plat nomor sudah terdaftar');

    const saved: string[] = [];
    try {
      const stnkKey = await this.storage.save(stnk, 'vehicles/stnk');
      saved.push(stnkKey);
      let photoKey: string | null = null;
      if (photo) {
        photoKey = await this.storage.save(photo, 'vehicles/photo');
        saved.push(photoKey);
      }

      return await this.prisma.vehicle.create({
        data: {
          partnerId: partner.id,
          type: dto.type,
          plateNumber: dto.plateNumber,
          brand: dto.brand,
          model: dto.model,
          maxWeightKg: dto.maxWeightKg,
          maxVolumeM3: dto.maxVolumeM3,
          stnkPhotoUrl: stnkKey,
          photoUrl: photoKey,
        },
        omit: OMIT_FILES,
      });
    } catch (err) {
      await Promise.all(saved.map((key) => this.storage.remove(key)));
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException('Plat nomor sudah terdaftar');
      }
      throw err;
    }
  }

  async listMine(userId: string) {
    return this.prisma.vehicle.findMany({
      where: { partner: { userId } },
      omit: OMIT_FILES,
      orderBy: { createdAt: 'desc' },
    });
  }

  // Soft delete: riwayat order yang memakai kendaraan ini tetap utuh
  async deactivate(userId: string, id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: { partner: { select: { userId: true } } },
    });
    if (!vehicle || vehicle.partner.userId !== userId) {
      throw new NotFoundException('Kendaraan tidak ditemukan');
    }
    return this.prisma.vehicle.update({
      where: { id },
      data: { isActive: false },
      omit: OMIT_FILES,
    });
  }

  async openFile(id: string, kind: VehicleFileKind, user: AuthUser) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: { partner: { select: { userId: true } } },
    });
    if (!vehicle) throw new NotFoundException('Kendaraan tidak ditemukan');

    const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
    if (!isAdmin && vehicle.partner.userId !== user.userId) {
      throw new ForbiddenException();
    }

    const key = kind === VehicleFileKind.STNK ? vehicle.stnkPhotoUrl : vehicle.photoUrl;
    if (!key) throw new NotFoundException('File tidak ditemukan');
    return this.storage.open(key);
  }
}
