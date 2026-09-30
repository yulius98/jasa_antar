import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { VehicleType } from '../../generated/prisma/enums.js';

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  pickupAddress: string;

  @Type(() => Number)
  @IsLatitude()
  pickupLatitude: number;

  @Type(() => Number)
  @IsLongitude()
  pickupLongitude: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  dropoffAddress: string;

  @Type(() => Number)
  @IsLatitude()
  dropoffLatitude: number;

  @Type(() => Number)
  @IsLongitude()
  dropoffLongitude: number;

  @IsEnum(VehicleType)
  vehicleType: VehicleType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  itemDescription?: string;

  // Order dijadwalkan di masa depan; kosongkan untuk order langsung (ASAP)
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  promoCode?: string;
}
