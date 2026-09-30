import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PartnerStatus } from '../../generated/prisma/enums.js';

export class ListPartnersQuery {
  @IsOptional()
  @IsEnum(PartnerStatus)
  status?: PartnerStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
