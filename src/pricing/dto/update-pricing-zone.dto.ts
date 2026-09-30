import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreatePricingZoneDto } from './create-pricing-zone.dto.js';

export class UpdatePricingZoneDto extends PartialType(CreatePricingZoneDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
