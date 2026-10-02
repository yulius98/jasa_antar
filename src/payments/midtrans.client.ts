import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// @ts-expect-error -- paket midtrans-client tidak menyertakan tipe TypeScript resmi
import midtransClient from 'midtrans-client';

export interface CreateSnapTransactionParams {
  orderNumber: string;
  grossAmount: number;
  customerName: string;
  customerPhone: string;
}

export interface SnapTransactionResult {
  token: string;
  redirectUrl: string;
}

/**
 * Pembungkus tipis di atas SDK midtrans-client, supaya PaymentsService tidak
 * bergantung langsung pada SDK pihak ketiga (gampang diganti/di-mock saat tes).
 */
@Injectable()
export class MidtransClientService {
  private readonly snap: {
    createTransaction: (payload: unknown) => Promise<{ token: string; redirect_url: string }>;
  };
  readonly serverKey: string;

  constructor(config: ConfigService) {
    this.serverKey = config.getOrThrow<string>('MIDTRANS_SERVER_KEY');
    this.snap = new midtransClient.Snap({
      isProduction: config.get('MIDTRANS_IS_PRODUCTION') === 'true',
      serverKey: this.serverKey,
      clientKey: config.get<string>('MIDTRANS_CLIENT_KEY'),
    });
  }

  async createSnapTransaction(params: CreateSnapTransactionParams): Promise<SnapTransactionResult> {
    const result = await this.snap.createTransaction({
      transaction_details: {
        order_id: params.orderNumber,
        gross_amount: Math.round(params.grossAmount),
      },
      customer_details: {
        first_name: params.customerName,
        phone: params.customerPhone,
      },
    });
    return { token: result.token, redirectUrl: result.redirect_url };
  }
}
