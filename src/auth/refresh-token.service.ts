import { createHash, randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface RefreshTokenSession {
  userId: string;
  refreshToken: string;
  expiresAt: Date;
}

type RotationResult =
  | { status: 'rotated'; session: RefreshTokenSession }
  | { status: 'invalid' };

@Injectable()
export class RefreshTokenService {
  private readonly refreshTokenTtlDays: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.refreshTokenTtlDays = config.getOrThrow<number>(
      'REFRESH_TOKEN_TTL_DAYS',
    );
  }

  async createSession(
    userId: string,
    transaction?: Prisma.TransactionClient,
  ): Promise<RefreshTokenSession> {
    const refreshToken = this.generateToken();
    const expiresAt = this.getExpirationDate();

    const client = transaction ?? this.prisma;
    await client.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt,
      },
    });

    return { userId, refreshToken, expiresAt };
  }

  async rotate(presentedToken: string): Promise<RefreshTokenSession> {
    if (!this.isValidTokenShape(presentedToken)) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const tokenHash = this.hashToken(presentedToken);
    const result = await this.prisma.$transaction(async (transaction) => {
      const storedToken = await transaction.refreshToken.findUnique({
        where: { tokenHash },
      });

      if (!storedToken) {
        return { status: 'invalid' } satisfies RotationResult;
      }

      const now = new Date();
      if (storedToken.revokedAt) {
        await this.revokeFamily(transaction, storedToken.familyId, now);
        return { status: 'invalid' } satisfies RotationResult;
      }

      if (storedToken.expiresAt <= now) {
        await transaction.refreshToken.updateMany({
          where: { id: storedToken.id, revokedAt: null },
          data: { revokedAt: now },
        });
        return { status: 'invalid' } satisfies RotationResult;
      }

      // This conditional write claims the token exactly once. Concurrent
      // requests that lose the claim revoke the family instead of branching it.
      const claim = await transaction.refreshToken.updateMany({
        where: {
          id: storedToken.id,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { revokedAt: now },
      });

      if (claim.count !== 1) {
        await this.revokeFamily(transaction, storedToken.familyId, now);
        return { status: 'invalid' } satisfies RotationResult;
      }

      const replacementToken = this.generateToken();
      const replacementExpiresAt = this.getExpirationDate(now);
      const replacement = await transaction.refreshToken.create({
        data: {
          userId: storedToken.userId,
          familyId: storedToken.familyId,
          tokenHash: this.hashToken(replacementToken),
          expiresAt: replacementExpiresAt,
        },
      });

      await transaction.refreshToken.update({
        where: { id: storedToken.id },
        data: { rotatedToId: replacement.id },
      });

      return {
        status: 'rotated',
        session: {
          userId: storedToken.userId,
          refreshToken: replacementToken,
          expiresAt: replacementExpiresAt,
        },
      } satisfies RotationResult;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

    if (result.status !== 'rotated') {
      throw new UnauthorizedException('Invalid refresh token.');
    }
    return result.session;
  }

  async revokeSession(
    presentedToken: string,
    expectedUserId: string,
  ): Promise<void> {
    if (!this.isValidTokenShape(presentedToken)) {
      return;
    }

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: {
        tokenHash: this.hashToken(presentedToken),
        userId: expectedUserId,
      },
    });
    if (!storedToken) {
      return;
    }

    await this.prisma.refreshToken.updateMany({
      where: { familyId: storedToken.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeFamily(
    transaction: Prisma.TransactionClient,
    familyId: string,
    revokedAt: Date,
  ): Promise<void> {
    await transaction.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt },
    });
  }

  private generateToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private getExpirationDate(from = new Date()): Date {
    return new Date(
      from.getTime() + this.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
    );
  }

  private isValidTokenShape(token: unknown): token is string {
    return (
      typeof token === 'string' &&
      token.length >= 40 &&
      token.length <= 128 &&
      /^[A-Za-z0-9_-]+$/.test(token)
    );
  }
}
