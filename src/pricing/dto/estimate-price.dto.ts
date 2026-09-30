import { Type } from 'class-transformer';
import { IsEnum, IsLatitude, IsLongitude, IsOptional, IsString } from 'class-validator';
import { VehicleType } from '../../generated/prisma/enums.js';

export class EstimatePriceDto {
  @Type(() => Number)
  @IsLatitude()
  pickupLatitude: number;

  @Type(() => Number)
  @IsLongitude()
  pickupLongitude: number;

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
  promoCode?: string;
}
