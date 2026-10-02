import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../common/auth-user.js';
import { UserRole } from '../generated/prisma/enums.js';
import { TrackingService } from './tracking.service.js';
import { SubmitLocationDto } from './dto/submit-location.dto.js';
import { TrackingHistoryQuery } from './dto/tracking-history.query.js';

@Controller('tracking')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TrackingController {
  constructor(private tracking: TrackingService) {}

  @Post()
  @Roles(UserRole.PARTNER)
  submit(@CurrentUser() user: AuthUser, @Body() dto: SubmitLocationDto) {
    return this.tracking.submitLocation(user.userId, dto);
  }

  @Get('orders/:orderId/latest')
  @Roles(UserRole.CUSTOMER, UserRole.PARTNER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  latest(@Param('orderId', ParseUUIDPipe) orderId: string, @CurrentUser() user: AuthUser) {
    return this.tracking.latest(user, orderId);
  }

  @Get('orders/:orderId/history')
  @Roles(UserRole.CUSTOMER, UserRole.PARTNER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  history(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentUser() user: AuthUser,
    @Query() query: TrackingHistoryQuery,
  ) {
    return this.tracking.history(user, orderId, query);
  }
}
