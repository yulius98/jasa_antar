import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../common/auth-user.js';
import { UserRole } from '../generated/prisma/enums.js';
import { RatingsService } from './ratings.service.js';
import { CreateRatingDto } from './dto/create-rating.dto.js';
import { ListRatingsQuery } from './dto/list-ratings.query.js';

@Controller('ratings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RatingsController {
  constructor(private ratings: RatingsService) {}

  @Post()
  @Roles(UserRole.CUSTOMER)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRatingDto) {
    return this.ratings.create(user.userId, dto);
  }

  // Siapa pun yang sudah login boleh lihat rating & ulasan seorang partner
  // (tanpa identitas customer) -- lazim dipakai untuk pertimbangan sebelum order.
  @Get('partner/:partnerId')
  @Roles(UserRole.CUSTOMER, UserRole.PARTNER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  listForPartner(
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
    @Query() query: ListRatingsQuery,
  ) {
    return this.ratings.listForPartner(partnerId, query);
  }

  @Get('order/:orderId')
  @Roles(UserRole.CUSTOMER, UserRole.PARTNER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  getForOrder(@Param('orderId', ParseUUIDPipe) orderId: string, @CurrentUser() user: AuthUser) {
    return this.ratings.getForOrder(user, orderId);
  }
}
