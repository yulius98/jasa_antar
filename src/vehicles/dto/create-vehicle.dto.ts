import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
} from 'class-validator';
import { VehicleType } from '../../generated/prisma/enums.js';

export class CreateVehicleDto {
  @IsEnum(VehicleType)
  type: VehicleType;

  // Dinormalisasi: spasi dibuang, huruf besar. "b 1234 xyz" -> "B1234XYZ"
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : value,
  )
  @Matches(/^[A-Z]{1,2}\d{1,4}[A-Z]{0,3}$/, { message: 'Format plat nomor tidak valid' })
  plateNumber: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  brand: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  model: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(99999)
  maxWeightKg: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(999)
  maxVolumeM3: number;
}
