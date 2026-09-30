import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface AttemptRecord {
  count: number;
  windowStartedAt: number;
  lockedUntil: number | null;
}

/**
 * Pembatas percobaan login berbasis in-memory, per email (case-insensitive).
 *
 * Cara kerja:
 * - Setiap login gagal menambah counter dalam satu "jendela waktu" (window).
 * - Kalau counter mencapai batas maksimal, akun dikunci selama LOGIN_LOCKOUT_MINUTES.
 * - Login berhasil menghapus record sepenuhnya (reset).
 * - Record yang sudah lewat jendela waktunya otomatis dianggap kedaluwarsa
 *   dan dihitung ulang dari nol, tanpa perlu proses pembersihan terpisah.
 *
 * CATATAN PRODUCTION: penyimpanan ini ada di memori proses Node, jadi:
 *  - reset ke nol setiap kali server di-restart/redeploy
 *  - tidak sinkron kalau backend dijalankan lebih dari satu instance (load balancer)
 * Untuk skala itu, ganti penyimpanan Map di bawah dengan Redis (INCR + EXPIRE),
 * logika publiknya (checkAllowed/registerFailure/registerSuccess) bisa tetap sama.
 */
@Injectable()
export class LoginThrottleService {
  private readonly attempts = new Map<string, AttemptRecord>();

  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly lockoutMs: number;

  constructor(config: ConfigService) {
    this.maxAttempts = Number(config.get('LOGIN_MAX_ATTEMPTS') ?? 5);
    this.windowMs = Number(config.get('LOGIN_ATTEMPT_WINDOW_MINUTES') ?? 15) * 60_000;
    this.lockoutMs = Number(config.get('LOGIN_LOCKOUT_MINUTES') ?? 15) * 60_000;
  }

  /** Lempar 429 kalau email ini sedang terkunci. Dipanggil SEBELUM cek password. */
  checkAllowed(email: string): void {
    const record = this.attempts.get(this.key(email));
    if (!record?.lockedUntil) return;

    const remainingMs = record.lockedUntil - Date.now();
    if (remainingMs <= 0) return; // masa kunci sudah habis, boleh coba lagi

    const remainingMinutes = Math.ceil(remainingMs / 60_000);
    throw new HttpException(
      `Terlalu banyak percobaan login gagal. Coba lagi dalam ${remainingMinutes} menit.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /** Dipanggil setiap password salah / email tidak ditemukan. */
  registerFailure(email: string): void {
    const key = this.key(email);
    const now = Date.now();
    const existing = this.attempts.get(key);

    // Belum ada record, atau jendela waktu sebelumnya sudah lewat -> mulai hitung dari 1
    if (!existing || now - existing.windowStartedAt > this.windowMs) {
      this.attempts.set(key, { count: 1, windowStartedAt: now, lockedUntil: null });
      return;
    }

    const count = existing.count + 1;
    const lockedUntil = count >= this.maxAttempts ? now + this.lockoutMs : null;
    this.attempts.set(key, { count, windowStartedAt: existing.windowStartedAt, lockedUntil });
  }

  /** Dipanggil setiap login berhasil, supaya percobaan gagal sebelumnya tidak menumpuk. */
  registerSuccess(email: string): void {
    this.attempts.delete(this.key(email));
  }

  private key(email: string): string {
    return email.trim().toLowerCase();
  }
}
