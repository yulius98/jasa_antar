import { Matches } from 'class-validator';

export class ApplyPartnerDto {
  @Matches(/^\d{16}$/, { message: 'Nomor KTP harus 16 digit angka' })
  ktpNumber: string;

  @Matches(/^\d{12,14}$/, { message: 'Nomor SIM harus 12-14 digit angka' })
  simNumber: string;
}
