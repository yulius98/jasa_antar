// Body notifikasi Midtrans TIDAK divalidasi lewat class-validator seperti DTO lain,
// karena field persisnya tergantung metode pembayaran (VA, e-wallet, kartu beda-beda)
// dan Midtrans bisa menambah field baru kapan saja tanpa pemberitahuan.
// Kita hanya ambil field yang benar-benar dipakai; kalau field yang dibutuhkan
// tidak ada, mapMidtransStatus/verifyMidtransSignature akan gagal secara aman
// (signature tidak cocok / status tidak dikenali -> diabaikan, bukan dipaksakan).
export interface MidtransNotificationBody {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
  transaction_status: string;
  fraud_status?: string;
  payment_type?: string;
  transaction_id?: string;
}
