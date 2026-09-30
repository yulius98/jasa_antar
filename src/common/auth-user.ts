import type { UserRole } from '../generated/prisma/enums.js';

// Bentuk objek yang ditempelkan JwtStrategy ke request.user
export interface AuthUser {
  userId: string;
  role: UserRole;
}
