import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { PromoType } from '../../generated/prisma/enums.js';

export class CreatePromoDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9_-]{3,30}$/, {
    message: 'Kode promo hanya huruf besar, angka, - dan _, 3-30 karakter',
  })
  code: string;

  @IsEnum(PromoType)
  type: PromoType;

  // PERCENTAGE: 0-100 (mis. 15 = 15%). FIXED_AMOUNT: nominal rupiah.
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  value: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  maxDiscount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minOrderValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  usageLimit?: number;

  @IsDateString()
  validFrom: string;

  @IsDateString()
  validUntil: string;
}
