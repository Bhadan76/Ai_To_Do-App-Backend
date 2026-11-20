import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

const PROFILE_SELECT = {
  id: true,
  name: true,
  email: true,
  avatar: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type UserProfile = Prisma.UserGetPayload<{
  select: typeof PROFILE_SELECT;
}>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async getProfile(userId: string): Promise<UserProfile> {
    const profile = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PROFILE_SELECT,
    });
    if (!profile) {
      throw new NotFoundException('User not found.');
    }
    return profile;
  }

  async updateProfile(
    userId: string,
    input: UpdateProfileDto,
  ): Promise<UserProfile> {
    if (input.name === undefined && input.avatar === undefined) {
      throw new BadRequestException('At least one profile field is required.');
    }

    const data: Prisma.UserUpdateInput = {};
    if (input.name !== undefined) {
      data.name = input.name.trim();
    }
    if (input.avatar !== undefined) {
      data.avatar = input.avatar;
    }

    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data,
        select: PROFILE_SELECT,
      });
    } catch (error) {
      if (this.isRecordNotFoundError(error)) {
        throw new NotFoundException('User not found.');
      }
      throw error;
    }
  }

  async changePassword(
    userId: string,
    input: ChangePasswordDto,
  ): Promise<void> {
    await this.authService.changePassword(
      userId,
      input.currentPassword,
      input.newPassword,
    );
  }

  async deleteAccount(
    userId: string,
    input: DeleteAccountDto,
  ): Promise<void> {
    await this.authService.deleteAccount(
      userId,
      input.currentPassword,
      input.confirmation,
    );
  }

  private isRecordNotFoundError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    );
  }
}
