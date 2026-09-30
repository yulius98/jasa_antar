/**
 * Hitung jarak garis lurus antar dua koordinat pakai formula Haversine.
 * Ini estimasi jarak "burung terbang", bukan jarak jalan sesungguhnya
 * (itu baru akurat kalau nanti dipanggilkan Google Maps Directions API).
 * Cukup untuk estimasi harga awal sebelum order dikonfirmasi.
 */
const EARTH_RADIUS_KM = 6371;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineDistanceKm(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): number {
  const dLat = toRadians(toLat - fromLat);
  const dLng = toRadians(toLng - fromLng);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}
