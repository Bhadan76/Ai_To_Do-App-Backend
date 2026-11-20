import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
  };
  let strategy: JwtStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new JwtStrategy(
      { getOrThrow: () => 'test-secret' } as unknown as ConfigService,
      prisma as unknown as PrismaService,
    );
  });

  it('accepts a subject that identifies an existing user', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });

    await expect(strategy.validate({ sub: 'user-1' })).resolves.toEqual({
      id: 'user-1',
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { id: true },
    });
  });

  it('rejects a validly shaped subject for a deleted or nonexistent user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      strategy.validate({ sub: 'deleted-user' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does not expose database errors during user-existence validation', async () => {
    prisma.user.findUnique.mockRejectedValue(new Error('database detail'));

    await expect(strategy.validate({ sub: 'user-1' })).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(strategy.validate({ sub: 'user-1' })).rejects.not.toThrow(
      'database detail',
    );
  });
});
