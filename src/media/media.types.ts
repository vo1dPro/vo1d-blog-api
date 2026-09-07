import type { MediaKind } from '../generated/prisma/enums.js';

export interface MediaResponse {
  id: number;
  url: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  altText: string | null;
  kind: MediaKind;
  createdAt: string;
}

export type UploadPurpose = 'IMAGE' | 'PHOTO' | 'ICON';
