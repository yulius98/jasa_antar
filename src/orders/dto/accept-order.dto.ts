import { IsUUID } from 'class-validator';

export class AcceptOrderDto {
  @IsUUID()
  vehicleId: string;
}
