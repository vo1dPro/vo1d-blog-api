import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { MediaService } from '../media/media.service.js';
import type { UpdateSiteProfileDto } from './dto/site-profile.dto.js';

const PROFILE_ID = 1;

@Injectable()
export class SiteProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
  ) {}

  async getPublic(): Promise<Record<string, unknown>> {
    const profile = await this.prisma.siteProfile.findUnique({
      where: { id: PROFILE_ID },
      include: { avatarMedia: true },
    });
    if (profile === null) {
      throw new NotFoundException('Site profile has not been configured');
    }
    return {
      displayName: profile.displayName,
      role: profile.role,
      heroTitlePrefix: profile.heroTitlePrefix,
      heroDescription: profile.heroDescription,
      learningNote: profile.learningNote,
      footerMessage: profile.footerMessage,
      avatar:
        profile.avatarMedia === null ? null : this.mediaService.toResponse(profile.avatarMedia),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }

  async getAdmin(): Promise<Record<string, unknown>> {
    const profile = await this.prisma.siteProfile.findUnique({
      where: { id: PROFILE_ID },
      include: { avatarMedia: true },
    });
    if (profile === null) {
      throw new NotFoundException('Site profile has not been configured');
    }
    return {
      id: profile.id,
      displayName: profile.displayName,
      role: profile.role,
      heroTitlePrefix: profile.heroTitlePrefix,
      heroDescription: profile.heroDescription,
      learningNote: profile.learningNote,
      footerMessage: profile.footerMessage,
      avatarMediaId: profile.avatarMediaId,
      avatar:
        profile.avatarMedia === null ? null : this.mediaService.toResponse(profile.avatarMedia),
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }

  async update(input: UpdateSiteProfileDto): Promise<Record<string, unknown>> {
    const existing = await this.prisma.siteProfile.findUnique({ where: { id: PROFILE_ID } });
    if (existing === null) {
      throw new NotFoundException('Site profile has not been configured');
    }
    if (input.avatarMediaId !== undefined && input.avatarMediaId !== null) {
      const media = await this.prisma.mediaAsset.findUnique({ where: { id: input.avatarMediaId } });
      if (media === null) {
        throw new NotFoundException('Avatar media asset not found');
      }
    }
    await this.prisma.siteProfile.update({ where: { id: PROFILE_ID }, data: input });
    return this.getAdmin();
  }
}
