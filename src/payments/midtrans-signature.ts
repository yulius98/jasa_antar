import { createHash } from 'node:crypto';

/**
 * Verifikasi signature webhook Midtrans.
 * Formula resmi Midtrans: SHA512(order_id + status_code + gross_amount + ServerKey)
 * https://docs.midtrans.com/docs/https-notification-webhooks (bagian "Verify the notification")
 *
 * PENTING: gross_amount yang dikirim Midtrans di body notifikasi formatnya string
 * dengan 2 desimal (mis. "79193.00"), bukan angka biasa -- harus dipakai APA ADANYA
 * dari body notifikasi, jangan diformat ulang sendiri, karena satu karakter beda
 * saja membuat hash tidak cocok.
 */
export function verifyMidtransSignature(params: {
  orderId: string;
  statusCode: string;
  grossAmount: string;
  serverKey: string;
  signatureKey: string;
}): boolean {
  const raw = `${params.orderId}${params.statusCode}${params.grossAmount}${params.serverKey}`;
  const expected = createHash('sha512').update(raw).digest('hex');
  return expected === params.signatureKey;
}

export function computeMidtransSignature(params: {
  orderId: string;
  statusCode: string;
  grossAmount: string;
  serverKey: string;
}): string {
  const raw = `${params.orderId}${params.statusCode}${params.grossAmount}${params.serverKey}`;
  return createHash('sha512').update(raw).digest('hex');
}

/**
 * Pemetaan transaction_status Midtrans -> PaymentStatus kita sendiri.
 * Return null berarti TIDAK ADA perubahan status yang perlu dilakukan
 * (mis. 'pending' -- order_id ini baru dibuat, Payment kita juga masih PENDING).
 */
export type MidtransMappedStatus = 'PAID' | 'FAILED' | 'REFUNDED' | null;

export function mapMidtransStatus(
  transactionStatus: string,
  fraudStatus?: string,
): MidtransMappedStatus {
  switch (transactionStatus) {
    case 'capture':
      // Kartu kredit: capture perlu dicek fraud_status-nya, beda dari metode lain
      return fraudStatus === 'accept' ? 'PAID' : null;
    case 'settlement':
      return 'PAID';
    case 'deny':
    case 'cancel':
    case 'expire':
    case 'failure':
      return 'FAILED';
    case 'refund':
    case 'partial_refund':
      return 'REFUNDED';
    case 'pending':
    default:
      return null;
  }
}
