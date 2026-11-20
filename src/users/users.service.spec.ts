import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const authService = {
    changePassword: jest.fn(),
    deleteAccount: jest.fn(),
  };
  let service: UsersService;

  const profile = {
    id: 'user-1',
    name: 'Alex Morgan',
    email: 'alex@example.com',
    avatar: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue(profile);
    prisma.user.update.mockResolvedValue(profile);
    service = new UsersService(
      prisma as unknown as PrismaService,
      authService as unknown as AuthService,
    );
  });

  it('retrieves only the authenticated user profile fields', async () => {
    await expect(service.getProfile('user-1')).resolves.toEqual(profile);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  it('returns not found if the authenticated user no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.getProfile('deleted-user')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updates only explicitly allowed profile fields and returns safe fields', async () => {
    await service.updateProfile('user-1', {
      name: '  Alex M.  ',
      avatar: 'https://cdn.example.test/avatar.png',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        name: 'Alex M.',
        avatar: 'https://cdn.example.test/avatar.png',
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  it('allows clearing the avatar with null', async () => {
    await service.updateProfile('user-1', { avatar: null });

    expect(prisma.user.update.mock.calls[0][0].data).toEqual({ avatar: null });
  });

  it('rejects empty updates', async () => {
    await expect(
      service.updateProfile('user-1', {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('delegates password changes and account deletion to AuthService', async () => {
    await service.changePassword('user-1', {
      currentPassword: 'current',
      newPassword: 'new',
    });
    await service.deleteAccount('user-1', {
      currentPassword: 'current',
      confirmation: 'DELETE',
    });

    expect(authService.changePassword).toHaveBeenCalledWith(
      'user-1',
      'current',
      'new',
    );
    expect(authService.deleteAccount).toHaveBeenCalledWith(
      'user-1',
      'current',
      'DELETE',
    );
  });
});
