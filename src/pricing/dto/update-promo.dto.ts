import { PartialType, OmitType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreatePromoDto } from './create-promo.dto.js';

// Kode promo tidak boleh diubah setelah dibuat -- kalau salah ketik, buat kode baru
export class UpdatePromoDto extends PartialType(OmitType(CreatePromoDto, ['code'] as const)) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
