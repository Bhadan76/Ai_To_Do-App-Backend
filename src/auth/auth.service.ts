import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenService } from './refresh-token.service';

const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  avatar: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const DUMMY_PASSWORD_HASH = bcrypt.hash(
  randomBytes(32).toString('base64url'),
  12,
);

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface AuthResponse extends AuthTokens {
  user: PublicUser;
}

@Injectable()
export class AuthService {
  private readonly accessTokenExpiresIn: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly refreshTokens: RefreshTokenService,
    config: ConfigService,
  ) {
    this.accessTokenExpiresIn = this.parseAccessTokenTtl(
      config.getOrThrow<string>('JWT_ACCESS_TOKEN_TTL'),
    );
  }

  async register(input: RegisterDto): Promise<AuthResponse> {
    if (Buffer.byteLength(input.password, 'utf8') > 72) {
      throw new BadRequestException(
        'Password must not exceed 72 UTF-8 bytes.',
      );
    }

    const password = await bcrypt.hash(input.password, 12);
    let user: PublicUser;
    try {
      user = await this.prisma.user.create({
        data: {
          name: input.name.trim(),
          email: this.normalizeEmail(input.email),
          password,
        },
        select: PUBLIC_USER_SELECT,
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('An account with this email already exists.');
      }
      throw error;
    }

    const session = await this.refreshTokens.createSession(user.id);
    return this.issueAuthResponse(user, session);
  }

  async login(input: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: this.normalizeEmail(input.email) },
      select: { ...PUBLIC_USER_SELECT, password: true },
    });

    const exceedsBcryptLimit =
      Buffer.byteLength(input.password, 'utf8') > 72;
    const candidate = exceedsBcryptLimit
      ? randomBytes(32).toString('base64url')
      : input.password;
    const passwordHash = user?.password ?? (await DUMMY_PASSWORD_HASH);
    const passwordIsValid = await bcrypt.compare(candidate, passwordHash);
    if (!user || exceedsBcryptLimit || !passwordIsValid) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const { password: _password, ...publicUser } = user;
    const session = await this.prisma.$transaction(async (transaction) => {
      const userExists = await this.lockUserRow(transaction, user.id);
      if (!userExists) {
        throw new UnauthorizedException('Invalid email or password.');
      }

      const currentUser = await transaction.user.findUnique({
        where: { id: user.id },
        select: { password: true },
      });
      if (!currentUser || currentUser.password !== user.password) {
        throw new UnauthorizedException('Invalid email or password.');
      }

      return this.refreshTokens.createSession(user.id, transaction);
    });
    return this.issueAuthResponse(publicUser, session);
  }

  async refresh(presentedToken: string): Promise<AuthTokens> {
    const session = await this.refreshTokens.rotate(presentedToken);
    const accessToken = await this.jwtService.signAsync({
      sub: session.userId,
    });

    return {
      accessToken,
      refreshToken: session.refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.accessTokenExpiresIn,
    };
  }

  async logout(presentedToken: string, userId: string): Promise<void> {
    await this.refreshTokens.revokeSession(presentedToken, userId);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    if (Buffer.byteLength(newPassword, 'utf8') > 72) {
      throw new BadRequestException(
        'Password must not exceed 72 UTF-8 bytes.',
      );
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    await this.prisma.$transaction(async (transaction) => {
      const userExists = await this.lockUserRow(transaction, userId);
      if (!userExists) {
        throw new NotFoundException('User not found.');
      }

      const user = await transaction.user.findUnique({
        where: { id: userId },
        select: { password: true },
      });
      if (!user) {
        throw new NotFoundException('User not found.');
      }
      if (
        Buffer.byteLength(currentPassword, 'utf8') > 72 ||
        !(await bcrypt.compare(currentPassword, user.password))
      ) {
        throw new UnauthorizedException('Current password is incorrect.');
      }

      const updated = await transaction.user.updateMany({
        where: { id: userId, password: user.password },
        data: { password: newPasswordHash },
      });
      if (updated.count !== 1) {
        throw new UnauthorizedException('Current password is incorrect.');
      }

      await transaction.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  async deleteAccount(
    userId: string,
    currentPassword: string,
    confirmation: string,
  ): Promise<void> {
    if (confirmation !== 'DELETE') {
      throw new BadRequestException(
        'Account deletion confirmation is invalid.',
      );
    }

    const passwordHash = await this.getVerifiedPasswordHash(
      userId,
      currentPassword,
    );
    await this.prisma.$transaction(async (transaction) => {
      const deleted = await transaction.user.deleteMany({
        where: { id: userId, password: passwordHash },
      });
      if (deleted.count !== 1) {
        throw new UnauthorizedException('Current password is incorrect.');
      }
    });
  }

  private async issueAuthResponse(
    user: PublicUser,
    session: Awaited<ReturnType<RefreshTokenService['createSession']>>,
  ): Promise<AuthResponse> {
    const accessToken = await this.jwtService.signAsync({ sub: user.id });

    return {
      user,
      accessToken,
      refreshToken: session.refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.accessTokenExpiresIn,
    };
  }

  private async lockUserRow(
    transaction: Prisma.TransactionClient,
    userId: string,
  ): Promise<boolean> {
    const lockedRows = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "User"
      WHERE "id" = ${userId}
      FOR UPDATE
    `;
    return lockedRows.length === 1;
  }

  private normalizeEmail(email: string): string {
    return email.trim().normalize('NFC').toLowerCase();
  }

  private async getVerifiedPasswordHash(
    userId: string,
    currentPassword: string,
  ): Promise<string> {
    if (Buffer.byteLength(currentPassword, 'utf8') > 72) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (!(await bcrypt.compare(currentPassword, user.password))) {
      throw new UnauthorizedException('Current password is incorrect.');
    }
    return user.password;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private parseAccessTokenTtl(ttl: string): number {
    const match = /^([1-9]\d*)(s|m|h|d)$/.exec(ttl);
    if (!match) {
      throw new Error('Invalid JWT_ACCESS_TOKEN_TTL configuration.');
    }

    const value = Number(match[1]);
    const unitSeconds: Record<string, number> = {
      s: 1,
      m: 60,
      h: 60 * 60,
      d: 24 * 60 * 60,
    };
    return value * unitSeconds[match[2]];
  }
}
