export interface AuthenticatedAdmin {
  id: number;
  email: string;
}

export interface SessionAuthentication {
  admin: AuthenticatedAdmin;
  tokenHash: string;
}
