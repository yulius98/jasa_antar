import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
import { PartnersService } from './partners.service.js';
import { PartnerDocumentType } from './partner-document-type.js';
import { ApplyPartnerDto } from './dto/apply-partner.dto.js';
import { ListPartnersQuery } from './dto/list-partners.query.js';
import { PartnerReasonDto } from './dto/partner-reason.dto.js';
import { SetOnlineDto } from './dto/set-online.dto.js';

@Controller('partners')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PartnersController {
  constructor(private partners: PartnersService) {}

  // Customer mengajukan diri jadi partner (role tetap CUSTOMER sampai disetujui admin)
  @Post('apply')
  @Roles(UserRole.CUSTOMER)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'ktpPhoto', maxCount: 1 },
        { name: 'simPhoto', maxCount: 1 },
      ],
      imageUploadOptions,
    ),
  )
  apply(
    @CurrentUser() user: AuthUser,
    @Body() dto: ApplyPartnerDto,
    @UploadedFiles() files: Record<string, UploadedFileData[]>,
  ) {
    return this.partners.apply(user.userId, dto, files);
  }

  // NB: route 'me' harus dideklarasikan sebelum ':id'
  @Get('me')
  @Roles(UserRole.CUSTOMER, UserRole.PARTNER)
  me(@CurrentUser() user: AuthUser) {
    return this.partners.me(user.userId);
  }

  @Patch('me/online')
  @Roles(UserRole.PARTNER)
  setOnline(@CurrentUser() user: AuthUser, @Body() dto: SetOnlineDto) {
    return this.partners.setOnline(user.userId, dto.isOnline);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  list(@Query() query: ListPartnersQuery) {
    return this.partners.list(query);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.partners.detail(id);
  }

  @Patch(':id/approve')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthUser) {
    return this.partners.approve(id, admin.userId);
  }

  @Patch(':id/reject')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PartnerReasonDto) {
    return this.partners.reject(id, dto.reason);
  }

  @Patch(':id/suspend')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  suspend(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PartnerReasonDto) {
    return this.partners.suspend(id, dto.reason);
  }

  // Dokumen identitas: hanya admin atau pemiliknya
  @Get(':id/documents/:type')
  @Roles(UserRole.CUSTOMER, UserRole.PARTNER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Header('Cache-Control', 'private, no-store')
  document(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('type', new ParseEnumPipe(PartnerDocumentType)) type: PartnerDocumentType,
    @CurrentUser() user: AuthUser,
  ) {
    return this.partners.openDocument(id, type, user);
  }
}
