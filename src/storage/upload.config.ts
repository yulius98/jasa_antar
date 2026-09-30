// Batas upload untuk endpoint bergambar: maks 5 MB per file, maks 2 file per request.
export const imageUploadOptions = {
  limits: { fileSize: 5 * 1024 * 1024, files: 2 },
};
