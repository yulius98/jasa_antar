import { IsString, MaxLength, MinLength } from 'class-validator';

// Dipakai untuk reject dan suspend
export class PartnerReasonDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}
