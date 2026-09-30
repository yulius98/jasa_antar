import { Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsNumber, IsPositive, IsString, Min } from 'class-validator';
import { VehicleType } from '../../generated/prisma/enums.js';

export class CreatePricingZoneDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(VehicleType)
  vehicleType: VehicleType;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  baseFare: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  perKmRate: number;

  // Jarak minimum yang dihitung, mencegah harga terlalu kecil untuk order sangat dekat
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minDistance: number;
}
