import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from '../payments.service.js';
import { verifyMidtransSignature } from '../midtrans-signature.js';
import type { MidtransNotificationBody } from '../dto/midtrans-notification.dto.js';

// SENGAJA TIDAK ADA @UseGuards(JwtAuthGuard) -- endpoint ini dipanggil server
// Midtrans, bukan user yang login. Keasliannya diverifikasi lewat signature_key,
// bukan JWT. Lihat catatan yang sama di struktur.md.
@Controller('payments/webhooks/midtrans')
export class MidtransWebhookController {
  constructor(
    private payments: PaymentsService,
    private config: ConfigService,
  ) {}

  @Post()
  async handle(@Body() body: MidtransNotificationBody) {
    const serverKey = this.config.getOrThrow<string>('MIDTRANS_SERVER_KEY');
    const valid = verifyMidtransSignature({
      orderId: body.order_id,
      statusCode: body.status_code,
      grossAmount: body.gross_amount,
      serverKey,
      signatureKey: body.signature_key,
    });
    if (!valid) {
      // 401 di sini membuat Midtrans mencatat notifikasi gagal -- itu yang kita
      // mau kalau signature tidak cocok (mencegah pemalsuan notifikasi).
      throw new UnauthorizedException('Signature tidak valid');
    }
    return this.payments.handleMidtransNotification(body);
  }
}
