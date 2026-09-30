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
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../common/auth-user.js';
import { UserRole } from '../generated/prisma/enums.js';
import { OrdersService } from './orders.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { AcceptOrderDto } from './dto/accept-order.dto.js';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto.js';
import { CancelOrderDto } from './dto/cancel-order.dto.js';
import { ListOrdersQuery } from './dto/list-orders.query.js';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @Roles(UserRole.CUSTOMER)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.orders.create(user.userId, dto);
  }

  @Get('me')
  @Roles(UserRole.CUSTOMER)
  listMine(@CurrentUser() user: AuthUser, @Query() query: ListOrdersQuery) {
    return this.orders.listMine(user.userId, query);
  }

  // NB: 'available' harus dideklarasikan sebelum ':id'
  @Get('available')
  @Roles(UserRole.PARTNER)
  listAvailable(@CurrentUser() user: AuthUser) {
    return this.orders.listAvailable(user.userId);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  listAll(@Query() query: ListOrdersQuery) {
    return this.orders.listAll(query);
  }

  @Get(':id')
  @Roles(UserRole.CUSTOMER, UserRole.PARTNER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.orders.detail(user, id);
  }

  @Patch(':id/accept')
  @Roles(UserRole.PARTNER)
  accept(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: AcceptOrderDto,
  ) {
    return this.orders.accept(user.userId, id, dto);
  }

  @Patch(':id/status')
  @Roles(UserRole.PARTNER)
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orders.updateStatus(user.userId, id, dto);
  }

  @Patch(':id/cancel')
  @Roles(UserRole.CUSTOMER, UserRole.PARTNER)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CancelOrderDto,
  ) {
    return this.orders.cancel(user, id, dto);
  }
}
