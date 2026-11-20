import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RefreshTokenService } from './refresh-token.service';

describe('RefreshTokenService', () => {
  const refreshTokenModel = {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  };
  const prisma = {
    refreshToken: refreshTokenModel,
    $transaction: jest.fn(),
  };
  const config = {
    getOrThrow: jest.fn().mockReturnValue(30),
  };
  let service: RefreshTokenService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (operation: (transaction: typeof prisma) => Promise<unknown>) =>
        operation(prisma),
    );
    service = new RefreshTokenService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
    );
  });

  it('creates a cryptographically random token but persists only its SHA-256 hash', async () => {
    refreshTokenModel.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'refresh-row-1',
        ...data,
      }),
    );

    const result = await service.createSession('user-1');
    const storedHash = refreshTokenModel.create.mock.calls[0][0].data.tokenHash;

    expect(result.refreshToken).toHaveLength(43);
    expect(storedHash).toBe(
      createHash('sha256').update(result.refreshToken).digest('hex'),
    );
    expect(storedHash).not.toBe(result.refreshToken);
  });

  it('creates a login session through the supplied transaction client', async () => {
    const transactionRefreshToken = {
      create: jest.fn().mockResolvedValue({ id: 'transaction-row' }),
    };
    const transaction = {
      refreshToken: transactionRefreshToken,
    };

    await service.createSession(
      'user-1',
      transaction as unknown as Prisma.TransactionClient,
    );

    expect(transactionRefreshToken.create).toHaveBeenCalledTimes(1);
    expect(refreshTokenModel.create).not.toHaveBeenCalled();
  });

  it('rotates a valid token transactionally and links its replacement', async () => {
    const oldToken = {
      id: 'old-row',
      userId: 'user-1',
      familyId: 'family-1',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    };
    refreshTokenModel.findUnique.mockResolvedValue(oldToken);
    refreshTokenModel.updateMany.mockResolvedValue({ count: 1 });
    refreshTokenModel.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'new-row',
        ...data,
      }),
    );

    const result = await service.rotate('A'.repeat(43));

    expect(result.userId).toBe('user-1');
    expect(result.refreshToken).toHaveLength(43);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(refreshTokenModel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'old-row',
          revokedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
      }),
    );
    expect(refreshTokenModel.update).toHaveBeenCalledWith({
      where: { id: 'old-row' },
      data: { rotatedToId: 'new-row' },
    });
  });

  it('revokes the full token family when a revoked token is reused', async () => {
    refreshTokenModel.findUnique.mockResolvedValue({
      id: 'old-row',
      userId: 'user-1',
      familyId: 'family-1',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
    });
    refreshTokenModel.updateMany.mockResolvedValue({ count: 2 });

    await expect(service.rotate('B'.repeat(43))).rejects.toThrow(
      UnauthorizedException,
    );

    expect(refreshTokenModel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { familyId: 'family-1', revokedAt: null },
      }),
    );
  });

  it('rejects a token when another concurrent request already claimed it', async () => {
    refreshTokenModel.findUnique.mockResolvedValue({
      id: 'old-row',
      userId: 'user-1',
      familyId: 'family-1',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });
    refreshTokenModel.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    await expect(service.rotate('C'.repeat(43))).rejects.toThrow(
      UnauthorizedException,
    );

    expect(refreshTokenModel.create).not.toHaveBeenCalled();
    expect(refreshTokenModel.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { familyId: 'family-1', revokedAt: null },
      }),
    );
  });

  it('revokes the complete token family on logout', async () => {
    refreshTokenModel.findUnique.mockResolvedValue({
      id: 'current-row',
      userId: 'user-1',
      familyId: 'family-1',
    });
    refreshTokenModel.updateMany.mockResolvedValue({ count: 1 });

    await service.revokeSession('D'.repeat(43), 'user-1');

    expect(refreshTokenModel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { familyId: 'family-1', revokedAt: null },
      }),
    );
    expect(refreshTokenModel.findUnique).toHaveBeenCalledWith({
      where: {
        tokenHash: expect.any(String),
        userId: 'user-1',
      },
    });
  });

  it('rejects expired refresh tokens', async () => {
    refreshTokenModel.findUnique.mockResolvedValue({
      id: 'expired-row',
      userId: 'user-1',
      familyId: 'family-1',
      expiresAt: new Date(Date.now() - 60_000),
      revokedAt: null,
    });
    refreshTokenModel.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.rotate('E'.repeat(43))).rejects.toThrow(
      UnauthorizedException,
    );

    expect(refreshTokenModel.create).not.toHaveBeenCalled();
  });
});
