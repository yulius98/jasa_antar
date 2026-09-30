import {
  BadRequestException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';

// Bentuk file hasil upload multer (memory storage)
export interface UploadedFileData {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/**
 * Satu-satunya tempat yang tahu di mana file disimpan. Saat pindah ke S3/R2,
 * cukup ganti isi class ini; modul lain tidak perlu berubah.
 * Yang dikembalikan/diterima adalah "key" (path relatif), bukan URL publik.
 */
@Injectable()
export class StorageService {
  private readonly baseDir: string;

  constructor(config: ConfigService) {
    this.baseDir = resolve(config.get<string>('UPLOAD_DIR') ?? './uploads');
  }

  async save(file: UploadedFileData, folder: string): Promise<string> {
    // Ekstensi ditentukan dari isi file (magic bytes), bukan dari nama/mimetype
    // kiriman client yang bisa dipalsukan.
    const ext = this.detectImageExt(file.buffer);
    if (!ext) {
      throw new BadRequestException('File harus berupa gambar JPG, PNG, atau WEBP');
    }

    const key = `${folder}/${randomUUID()}${ext}`;
    const fullPath = this.resolveKey(key);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, file.buffer);
    return key;
  }

  async remove(key: string | null | undefined): Promise<void> {
    if (!key) return;
    try {
      await unlink(this.resolveKey(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  async open(key: string): Promise<StreamableFile> {
    const fullPath = this.resolveKey(key);
    try {
      await stat(fullPath);
    } catch {
      throw new NotFoundException('File tidak ditemukan');
    }
    const type = CONTENT_TYPES[extname(fullPath)] ?? 'application/octet-stream';
    return new StreamableFile(createReadStream(fullPath), { type });
  }

  // Pastikan key tidak bisa keluar dari folder upload (path traversal)
  private resolveKey(key: string): string {
    const fullPath = resolve(this.baseDir, key);
    if (!fullPath.startsWith(this.baseDir + sep)) {
      throw new BadRequestException('Path file tidak valid');
    }
    return fullPath;
  }

  private detectImageExt(buf: Buffer): string | null {
    if (buf.length < 12) return null;
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
    if (
      buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) {
      return '.png';
    }
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
      return '.webp';
    }
    return null;
  }
}
