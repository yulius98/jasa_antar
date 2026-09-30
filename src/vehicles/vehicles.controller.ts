import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../common/auth-user.js';
import { UserRole } from '../generated/prisma/enums.js';
import { imageUploadOptions } from '../storage/upload.config.js';
import type { UploadedFileData } from '../storage/storage.service.js';
import { VehiclesService } from './vehicles.service.js';
import { VehicleFileKind } from './vehicle-file-kind.js';
import { CreateVehicleDto } from './dto/create-vehicle.dto.js';

@Controller('vehicles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  // CUSTOMER ikut diizinkan karena pemohon yang masih PENDING rolenya belum PARTNER
  @Post()
  @Roles(UserRole.CUSTOMER, UserRole.PARTNER)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'stnkPhoto', maxCount: 1 },
        { name: 'photo', maxCount: 1 },
      ],
      imageUploadOptions,
    ),
  )
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateVehicleDto,
    @UploadedFiles() files: Record<string, UploadedFileData[]>,
  ) {
    return this.vehicles.create(user.userId, dto, files);
  }

  @Get('me')
  @Roles(UserRole.CUSTOMER, UserRole.PARTNER)
  listMine(@CurrentUser() user: AuthUser) {
    return this.vehicles.listMine(user.userId);
  }

  @Delete(':id')
  @Roles(UserRole.CUSTOMER, UserRole.PARTNER)
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.vehicles.deactivate(user.userId, id);
  }

  @Get(':id/files/:kind')
  @Roles(
    UserRole.CUSTOMER,
    UserRole.PARTNER,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  )
  @Header('Cache-Control', 'private, no-store')
  file(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('kind', new ParseEnumPipe(VehicleFileKind)) kind: VehicleFileKind,
    @CurrentUser() user: AuthUser,
  ) {
    return this.vehicles.openFile(id, kind, user);
  }
}
