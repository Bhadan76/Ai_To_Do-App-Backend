import * as bcrypt from 'bcrypt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenService } from './refresh-token.service';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('dummy-bcrypt-hash'),
  compare: jest.fn(),
}));

describe('AuthService', () => {
  const prisma = {
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    refreshToken: {
      updateMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const jwtService = {
    signAsync: jest.fn(),
  };
  const refreshTokens = {
    createSession: jest.fn(),
    rotate: jest.fn(),
    revokeSession: jest.fn(),
  };
  const config = {
    getOrThrow: jest.fn().mockReturnValue('15m'),
  };
  let service: AuthService;
  const hashMock = bcrypt.hash as jest.MockedFunction<typeof bcrypt.hash>;
  const compareMock = bcrypt.compare as jest.MockedFunction<
    typeof bcrypt.compare
  >;

  const safeUser = {
    id: 'user-1',
    name: 'Alex Morgan',
    email: 'alex@example.com',
    avatar: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    hashMock.mockResolvedValue('bcrypt-hash');
    compareMock.mockResolvedValue(true);
    jwtService.signAsync.mockResolvedValue('signed-access-token');
    refreshTokens.createSession.mockResolvedValue({
      userId: safeUser.id,
      refreshToken: 'opaque-refresh-token',
      expiresAt: new Date('2026-02-01T00:00:00.000Z'),
    });
    prisma.user.create.mockResolvedValue(safeUser);
    prisma.user.findUnique.mockResolvedValue({
      ...safeUser,
      password: 'stored-bcrypt-hash',
    });
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.deleteMany.mockResolvedValue({ count: 1 });
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });
    prisma.$queryRaw.mockResolvedValue([{ id: safeUser.id }]);
    prisma.$transaction.mockImplementation(
      (operation: (transaction: typeof prisma) => Promise<unknown>) =>
        operation(prisma),
    );
    refreshTokens.rotate.mockResolvedValue({
      userId: safeUser.id,
      refreshToken: 'rotated-refresh-token',
      expiresAt: new Date('2026-02-01T00:00:00.000Z'),
    });
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      refreshTokens as unknown as RefreshTokenService,
      config as unknown as ConfigService,
    );
  });

  it('registers a user with a bcrypt hash and returns safe user data plus tokens', async () => {
    const input = {
      name: 'Alex Morgan',
      email: 'alex@example.com',
      password: 'A-strong-passphrase-2026',
    } as RegisterDto;

    const result = await service.register(input);

    expect(hashMock).toHaveBeenCalledWith(input.password, 12);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          name: input.name,
          email: input.email,
          password: 'bcrypt-hash',
        },
      }),
    );
    expect(result).toMatchObject({
      user: safeUser,
      accessToken: 'signed-access-token',
      refreshToken: 'opaque-refresh-token',
      tokenType: 'Bearer',
      expiresIn: 900,
    });
    expect(JSON.stringify(result)).not.toContain('password');
    expect(JSON.stringify(prisma.user.create.mock.calls[0][0].select)).not.toContain(
      'password',
    );
  });

  it('converts duplicate email races into a safe conflict response', async () => {
    prisma.user.create.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.register({
        name: 'Alex Morgan',
        email: 'alex@example.com',
        password: 'A-strong-passphrase-2026',
      } as RegisterDto),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects passwords exceeding bcrypt UTF-8 byte limits', async () => {
    await expect(
      service.register({
        name: 'Alex Morgan',
        email: 'alex@example.com',
        password: 'Ä'.repeat(37),
      } as RegisterDto),
    ).rejects.toThrow('Password must not exceed 72 UTF-8 bytes.');

    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('authenticates a valid password and issues both tokens', async () => {
    const result = await service.login({
      email: 'alex@example.com',
      password: 'A-strong-passphrase-2026',
    } as LoginDto);

    expect(compareMock).toHaveBeenCalledWith(
      'A-strong-passphrase-2026',
      'stored-bcrypt-hash',
    );
    expect(result.user).toEqual(safeUser);
    expect(result).not.toHaveProperty('user.password');
    expect(refreshTokens.createSession).toHaveBeenCalledWith(
      safeUser.id,
      prisma,
    );
  });

  it('rejects login if the password hash changed before synchronized session creation', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({ ...safeUser, password: 'old-password-hash' })
      .mockResolvedValueOnce({ password: 'new-password-hash' });

    await expect(
      service.login({
        email: 'alex@example.com',
        password: 'A-strong-passphrase-2026',
      } as LoginDto),
    ).rejects.toThrow('Invalid email or password.');

    expect(refreshTokens.createSession).not.toHaveBeenCalled();
  });

  it('uses a generic failure for an incorrect password', async () => {
    compareMock.mockResolvedValue(false);

    await expect(
      service.login({
        email: 'alex@example.com',
        password: 'wrong-password',
      } as LoginDto),
    ).rejects.toThrow('Invalid email or password.');
  });

  it('rejects login passwords exceeding bcrypt UTF-8 byte limits generically', async () => {
    await expect(
      service.login({
        email: 'alex@example.com',
        password: 'Ä'.repeat(37),
      } as LoginDto),
    ).rejects.toThrow('Invalid email or password.');
  });

  it('uses the same login failure message for an unknown email', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.login({
        email: 'unknown@example.com',
        password: 'wrong-password',
      } as LoginDto),
    ).rejects.toThrow('Invalid email or password.');
  });

  it('rotates refresh tokens and returns a fresh access token', async () => {
    const result = await service.refresh('old-refresh-token');

    expect(refreshTokens.rotate).toHaveBeenCalledWith('old-refresh-token');
    expect(jwtService.signAsync).toHaveBeenCalledWith({ sub: safeUser.id });
    expect(result).toEqual({
      accessToken: 'signed-access-token',
      refreshToken: 'rotated-refresh-token',
      tokenType: 'Bearer',
      expiresIn: 900,
    });
  });

  it('passes invalid refresh tokens through as unauthorized', async () => {
    refreshTokens.rotate.mockRejectedValue(
      new UnauthorizedException('Invalid refresh token.'),
    );

    await expect(service.refresh('invalid-token')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('revokes only the authenticated user session on logout', async () => {
    await service.logout('session-refresh-token', 'user-1');

    expect(refreshTokens.revokeSession).toHaveBeenCalledWith(
      'session-refresh-token',
      'user-1',
    );
  });

  it('changes the password and revokes active refresh sessions transactionally', async () => {
    compareMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await service.changePassword(
      safeUser.id,
      'current-password',
      'A-new-strong-passphrase-2026',
    );

    expect(compareMock).toHaveBeenCalledWith(
      'current-password',
      'stored-bcrypt-hash',
    );
    expect(hashMock).toHaveBeenCalledWith(
      'A-new-strong-passphrase-2026',
      12,
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: safeUser.id, password: 'stored-bcrypt-hash' },
      data: { password: 'bcrypt-hash' },
    });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: safeUser.id, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('does not update password or revoke sessions when the current password is wrong', async () => {
    compareMock.mockResolvedValue(false);

    await expect(
      service.changePassword(
        safeUser.id,
        'wrong-password',
        'A-new-strong-passphrase-2026',
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('rejects password changes exceeding bcrypt’s 72-byte limit', async () => {
    await expect(
      service.changePassword(safeUser.id, 'current', 'Ä'.repeat(37)),
    ).rejects.toThrow('Password must not exceed 72 UTF-8 bytes.');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects account deletion unless confirmation is exactly DELETE', async () => {
    await expect(
      service.deleteAccount(safeUser.id, 'current-password', 'delete'),
    ).rejects.toThrow('Account deletion confirmation is invalid.');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not delete an account when the current password is wrong', async () => {
    compareMock.mockResolvedValue(false);

    await expect(
      service.deleteAccount(safeUser.id, 'wrong-password', 'DELETE'),
    ).rejects.toThrow(UnauthorizedException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.user.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes only after verifying the current password in a transaction', async () => {
    compareMock.mockResolvedValue(true);

    await service.deleteAccount(
      safeUser.id,
      'current-password',
      'DELETE',
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.user.deleteMany).toHaveBeenCalledWith({
      where: { id: safeUser.id, password: 'stored-bcrypt-hash' },
    });
  });
});
