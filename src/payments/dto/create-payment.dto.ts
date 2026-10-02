import { IsEnum, IsUUID } from 'class-validator';
import { PaymentMethod } from '../../generated/prisma/enums.js';

export class CreatePaymentDto {
  @IsUUID()
  orderId: string;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;
}
