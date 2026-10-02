import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller.js';
import { MidtransWebhookController } from './webhooks/midtrans.webhook.controller.js';
import { PaymentsService } from './payments.service.js';
import { MidtransClientService } from './midtrans.client.js';

@Module({
  controllers: [PaymentsController, MidtransWebhookController],
  providers: [PaymentsService, MidtransClientService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
