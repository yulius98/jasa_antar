import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole, VehicleType } from '../generated/prisma/enums.js';
import { PricingService } from './pricing.service.js';
import { EstimatePriceDto } from './dto/estimate-price.dto.js';
import { CreatePricingZoneDto } from './dto/create-pricing-zone.dto.js';
import { UpdatePricingZoneDto } from './dto/update-pricing-zone.dto.js';
import { CreatePromoDto } from './dto/create-promo.dto.js';
import { UpdatePromoDto } from './dto/update-promo.dto.js';

@Controller('pricing')
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  // Publik: dibutuhkan sebelum user login (lihat estimasi harga di layar awal app)
  @Post('estimate')
  estimate(@Body() dto: EstimatePriceDto) {
    return this.pricing.estimate(dto);
  }

  @Get('zones')
  listZones(@Query('vehicleType') vehicleType?: VehicleType) {
    return this.pricing.listZones(vehicleType);
  }

  @Post('zones')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  createZone(@Body() dto: CreatePricingZoneDto) {
    return this.pricing.createZone(dto);
  }

  @Patch('zones/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  updateZone(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePricingZoneDto) {
    return this.pricing.updateZone(id, dto);
  }

  @Patch('zones/:id/deactivate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  deactivateZone(@Param('id', ParseUUIDPipe) id: string) {
    return this.pricing.deactivateZone(id);
  }

  @Get('promos')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  listPromos() {
    return this.pricing.listPromos();
  }

  @Post('promos')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  createPromo(@Body() dto: CreatePromoDto) {
    return this.pricing.createPromo(dto);
  }

  @Patch('promos/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  updatePromo(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePromoDto) {
    return this.pricing.updatePromo(id, dto);
  }
}
