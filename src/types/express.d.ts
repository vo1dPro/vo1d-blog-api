import type { AuthenticatedAdmin } from '../auth/auth.types.js';

declare global {
  namespace Express {
    interface Request {
      admin?: AuthenticatedAdmin;
      sessionTokenHash?: string;
    }
  }
}

export {};
