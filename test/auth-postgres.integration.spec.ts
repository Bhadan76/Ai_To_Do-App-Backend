import { randomBytes, createHash } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { RefreshTokenService } from '../src/auth/refresh-token.service';
import { RegisterDto } from '../src/auth/dto/register.dto';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';

const connectionString = process.env.TEST_DATABASE_URL;
const integrationSuite = connectionString ? describe : describe.skip;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

integrationSuite('Authentication services (real PostgreSQL)', () => {
  let prisma: PrismaService;
  let auth: AuthService;
  let refreshTokens: RefreshTokenService;
  let jwtService: JwtService;
  let emailPrefix: string;

  beforeAll(async () => {
    if (!connectionString) {
      throw new Error('TEST_DATABASE_URL is required for PostgreSQL tests.');
    }

    const url = new URL(connectionString);
    const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
    if (
      databaseName !== 'daily_task_test_db' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      (url.port || '5432') !== '5432'
    ) {
      throw new Error('TEST_DATABASE_URL does not match the approved test database.');
    }

    const config = {
      getOrThrow: (key: string) => {
        if (key === 'DATABASE_URL') return connectionString;
        if (key === 'JWT_ACCESS_TOKEN_TTL') return '15m';
        if (key === 'REFRESH_TOKEN_TTL_DAYS') return 30;
        throw new Error(`Unexpected test configuration key: ${key}`);
      },
    } as unknown as ConfigService;

    prisma = new PrismaService(config);
    await prisma.$connect();
    refreshTokens = new RefreshTokenService(prisma, config);
    jwtService = new JwtService({
      secret: 'integration-test-secret-at-least-32-bytes',
    });
    auth = new AuthService(
      prisma,
      jwtService,
      refreshTokens,
      config,
    );
    emailPrefix = `pg-auth-${randomBytes(8).toString('hex')}`;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  function registration(email: string): RegisterDto {
    return {
      name: 'PostgreSQL Integration User',
      email,
      password: 'A-strong-passphrase-2026',
    };
  }

  function tokenHash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  function gateFirstTransactionAfterUserLock(userId: string) {
    const lockAcquired = deferred();
    const releaseFirst = deferred();
    const secondLockAttempted = deferred();
    const originalTransaction = prisma.$transaction.bind(prisma);
    let transactionIndex = 0;

    Object.defineProperty(prisma, '$transaction', {
      configurable: true,
      value: (
        callback: (transaction: Prisma.TransactionClient) => Promise<unknown>,
        options?: unknown,
      ) => {
        const currentIndex = transactionIndex++;
        return originalTransaction(
          (transaction) => {
            const gatedTransaction = new Proxy(transaction, {
              get(target, property, receiver) {
                if (property === '$queryRaw') {
                  return (...args: unknown[]) => {
                    const result = Reflect.apply(
                      Reflect.get(target, property, target) as (
                        ...queryArgs: unknown[]
                      ) => unknown,
                      target,
                      args,
                    );
                    if (currentIndex === 1) {
                      secondLockAttempted.resolve();
                    }
                    return result;
                  };
                }

                if (property === 'user') {
                  return new Proxy(target.user, {
                    get(model, method, modelReceiver) {
                      const originalMethod = Reflect.get(
                        model,
                        method,
                        modelReceiver,
                      );
                      if (method !== 'findUnique') {
                        return originalMethod;
                      }
                      return async (
                        ...args: Parameters<typeof model.findUnique>
                      ) => {
                        const result = await Reflect.apply(
                          originalMethod,
                          model,
                          args,
                        );
                        const query = args[0];
                        if (
                          currentIndex === 0 &&
                          query.where.id === userId &&
                          query.select?.password
                        ) {
                          lockAcquired.resolve();
                          await releaseFirst.promise;
                        }
                        return result;
                      };
                    },
                  });
                }
                return Reflect.get(target, property, receiver);
              },
            });
            return callback(gatedTransaction as Prisma.TransactionClient);
          },
          options as never,
        );
      },
    });

    return {
      lockAcquired: lockAcquired.promise,
      secondLockAttempted: secondLockAttempted.promise,
      releaseFirst: releaseFirst.resolve,
      restore: () => {
        delete (prisma as unknown as { $transaction?: unknown }).$transaction;
      },
    };
  }

  async function createExpiredOrRevokedToken(
    userId: string,
    options: { expiresAt: Date; revokedAt?: Date },
  ): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: tokenHash(token),
        familyId: randomBytes(16).toString('hex'),
        expiresAt: options.expiresAt,
        revokedAt: options.revokedAt,
      },
    });
    return token;
  }

  it('registers with a real bcrypt hash, rejects duplicate email, and verifies login passwords', async () => {
    const email = `${emailPrefix}-register@example.test`;
    const input = registration(email);
    const result = await auth.register(input);
    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: result.user.id },
    });

    expect(stored.password).not.toBe(input.password);
    expect(await bcrypt.compare(input.password, stored.password)).toBe(true);
    await expect(auth.register(input)).rejects.toBeInstanceOf(ConflictException);

    const loggedIn = await auth.login({
      email: email.toUpperCase(),
      password: input.password,
    });
    expect(loggedIn.user.id).toBe(result.user.id);
    await expect(
      auth.login({ email, password: 'incorrect-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows only one concurrent refresh request and creates one replacement row', async () => {
    const user = await auth.register(
      registration(`${emailPrefix}-concurrent@example.test`),
    );
    const initial = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: tokenHash(user.refreshToken) },
    });

    const outcomes = await Promise.allSettled([
      auth.refresh(user.refreshToken),
      auth.refresh(user.refreshToken),
    ]);
    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    const winningResponse = outcomes.find(
      (outcome): outcome is PromiseFulfilledResult<
        Awaited<ReturnType<AuthService['refresh']>>
      > => outcome.status === 'fulfilled',
    );
    expect(winningResponse).toBeDefined();

    const family = await prisma.refreshToken.findMany({
      where: { familyId: initial.familyId },
    });
    const replacements = family.filter((token) => token.id !== initial.id);
    expect(replacements).toHaveLength(1);
    expect(replacements[0].tokenHash).toBe(
      tokenHash(winningResponse!.value.refreshToken),
    );
    expect(replacements[0].revokedAt).not.toBeNull();
    expect(family.every((token) => token.revokedAt !== null)).toBe(true);

    await expect(
      auth.refresh(winningResponse!.value.refreshToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const persistedFamily = await prisma.refreshToken.findMany({
      where: { familyId: initial.familyId },
    });
    expect(persistedFamily.every((token) => token.revokedAt !== null)).toBe(true);
  });

  it('commits family revocation when a rotated token is reused', async () => {
    const user = await auth.register(
      registration(`${emailPrefix}-reuse@example.test`),
    );
    const initial = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: tokenHash(user.refreshToken) },
    });
    await auth.refresh(user.refreshToken);

    await expect(auth.refresh(user.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    const family = await prisma.refreshToken.findMany({
      where: { familyId: initial.familyId },
    });
    expect(family.length).toBeGreaterThanOrEqual(2);
    expect(family.every((token) => token.revokedAt !== null)).toBe(true);
  });

  it('limits logout revocation to the authenticated user’s session', async () => {
    const userA = await auth.register(
      registration(`${emailPrefix}-owner-a@example.test`),
    );
    const userB = await auth.register(
      registration(`${emailPrefix}-owner-b@example.test`),
    );

    await auth.logout(userB.refreshToken, userA.user.id);
    const userBToken = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: tokenHash(userB.refreshToken) },
    });
    expect(userBToken.revokedAt).toBeNull();

    await auth.logout(userA.refreshToken, userA.user.id);
    const userAToken = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: tokenHash(userA.refreshToken) },
    });
    expect(userAToken.revokedAt).not.toBeNull();
  });

  it('rejects expired and revoked tokens and persists the expiration revocation', async () => {
    const user = await auth.register(
      registration(`${emailPrefix}-expiry@example.test`),
    );
    const expiredToken = await createExpiredOrRevokedToken(user.user.id, {
      expiresAt: new Date(Date.now() - 60_000),
    });
    const revokedToken = await createExpiredOrRevokedToken(user.user.id, {
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
    });

    await expect(auth.refresh(expiredToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(auth.refresh(revokedToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    const expiredRecord = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: tokenHash(expiredToken) },
    });
    expect(expiredRecord.revokedAt).not.toBeNull();
  });

  it('updates the password and revokes refresh sessions atomically', async () => {
    const registered = await auth.register(
      registration(`${emailPrefix}-password-atomic@example.test`),
    );
    const secondSession = await refreshTokens.createSession(registered.user.id);

    await auth.changePassword(
      registered.user.id,
      'A-strong-passphrase-2026',
      'A-new-strong-passphrase-2026',
    );

    const updatedUser = await prisma.user.findUniqueOrThrow({
      where: { id: registered.user.id },
      select: { password: true },
    });
    expect(
      await bcrypt.compare('A-new-strong-passphrase-2026', updatedUser.password),
    ).toBe(true);
    expect(
      await bcrypt.compare('A-strong-passphrase-2026', updatedUser.password),
    ).toBe(false);

    const sessions = await prisma.refreshToken.findMany({
      where: { userId: registered.user.id },
    });
    expect(sessions).toHaveLength(2);
    expect(sessions.every((session) => session.revokedAt !== null)).toBe(true);
    await expect(auth.refresh(registered.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(auth.refresh(secondSession.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('serializes a login that locks first so password change revokes its new session', async () => {
    const credentials = registration(`${emailPrefix}-login-lock-first@example.test`);
    const registered = await auth.register(credentials);
    const barrier = gateFirstTransactionAfterUserLock(registered.user.id);

    try {
      const loginPromise = auth.login({
        email: credentials.email,
        password: credentials.password,
      });
      await barrier.lockAcquired;

      const passwordChangePromise = auth.changePassword(
        registered.user.id,
        credentials.password,
        'A-new-strong-passphrase-2026',
      );
      await barrier.secondLockAttempted;
      barrier.releaseFirst();

      const loggedIn = await loginPromise;
      await passwordChangePromise;
      const sessions = await prisma.refreshToken.findMany({
        where: { userId: registered.user.id },
      });
      expect(sessions).toHaveLength(2);
      expect(sessions.every((session) => session.revokedAt !== null)).toBe(true);
      const loginSession = await prisma.refreshToken.findUniqueOrThrow({
        where: { tokenHash: tokenHash(loggedIn.refreshToken) },
      });
      expect(loginSession.revokedAt).not.toBeNull();
    } finally {
      barrier.releaseFirst();
      barrier.restore();
    }
  });

  it('rejects a stale login when password change locks first without creating a session', async () => {
    const credentials = registration(`${emailPrefix}-password-lock-first@example.test`);
    const registered = await auth.register(credentials);
    const sessionsBefore = await prisma.refreshToken.count({
      where: { userId: registered.user.id },
    });
    const barrier = gateFirstTransactionAfterUserLock(registered.user.id);

    try {
      const passwordChangePromise = auth.changePassword(
        registered.user.id,
        credentials.password,
        'A-new-strong-passphrase-2026',
      );
      await barrier.lockAcquired;

      const staleLoginPromise = auth.login({
        email: credentials.email,
        password: credentials.password,
      });
      await barrier.secondLockAttempted;
      barrier.releaseFirst();

      await passwordChangePromise;
      await expect(staleLoginPromise).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(
        await prisma.refreshToken.count({
          where: { userId: registered.user.id },
        }),
      ).toBe(sessionsBefore);
      const sessions = await prisma.refreshToken.findMany({
        where: { userId: registered.user.id },
      });
      expect(sessions.every((session) => session.revokedAt !== null)).toBe(true);
    } finally {
      barrier.releaseFirst();
      barrier.restore();
    }
  });

  it('rolls back the password update if refresh-token revocation fails', async () => {
    const registered = await auth.register(
      registration(`${emailPrefix}-password-rollback@example.test`),
    );
    const originalUser = await prisma.user.findUniqueOrThrow({
      where: { id: registered.user.id },
      select: { password: true },
    });
    const originalTransaction = prisma.$transaction.bind(prisma);

    Object.defineProperty(prisma, '$transaction', {
      configurable: true,
      value: (
        callback: (transaction: Prisma.TransactionClient) => Promise<unknown>,
      ) =>
        originalTransaction((transaction) => {
          const transactionWithFailingRevocation = new Proxy(transaction, {
            get(target, property, receiver) {
              if (property !== 'refreshToken') {
                return Reflect.get(target, property, receiver);
              }
              return new Proxy(target.refreshToken, {
                get(model, method, modelReceiver) {
                  if (method !== 'updateMany') {
                    return Reflect.get(model, method, modelReceiver);
                  }
                  return async (args: Parameters<typeof model.updateMany>[0]) => {
                    await model.updateMany(args);
                    throw new Error('Simulated refresh revocation failure.');
                  };
                },
              });
            },
          });
          return callback(
            transactionWithFailingRevocation as Prisma.TransactionClient,
          );
        }),
    });

    try {
      await expect(
        auth.changePassword(
          registered.user.id,
          'A-strong-passphrase-2026',
          'A-new-strong-passphrase-2026',
        ),
      ).rejects.toThrow('Simulated refresh revocation failure.');
    } finally {
      delete (prisma as unknown as { $transaction?: unknown }).$transaction;
    }

    const userAfterFailure = await prisma.user.findUniqueOrThrow({
      where: { id: registered.user.id },
      select: { password: true },
    });
    expect(userAfterFailure.password).toBe(originalUser.password);
    const sessionAfterFailure = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: tokenHash(registered.refreshToken) },
    });
    expect(sessionAfterFailure.revokedAt).toBeNull();
  });

  it('cascades account deletion and rejects deleted users’ refresh and access tokens', async () => {
    const registered = await auth.register(
      registration(`${emailPrefix}-delete-cascade@example.test`),
    );
    const accessToken = await jwtService.signAsync({ sub: registered.user.id });
    const category = await prisma.category.create({
      data: { name: 'Deletion test category', userId: registered.user.id },
    });
    const task = await prisma.task.create({
      data: {
        title: 'Deletion test task',
        userId: registered.user.id,
        categoryId: category.id,
      },
    });
    const conversation = await prisma.aiConversation.create({
      data: { title: 'Deletion test conversation', userId: registered.user.id },
    });
    const message = await prisma.aiMessage.create({
      data: {
        role: 'USER',
        content: 'Deletion test message',
        conversationId: conversation.id,
      },
    });
    const notification = await prisma.notification.create({
      data: {
        title: 'Deletion test notification',
        body: 'Deletion test body',
        userId: registered.user.id,
      },
    });

    await auth.deleteAccount(
      registered.user.id,
      'A-strong-passphrase-2026',
      'DELETE',
    );

    expect(
      await prisma.task.count({ where: { id: task.id } }),
    ).toBe(0);
    expect(
      await prisma.category.count({ where: { id: category.id } }),
    ).toBe(0);
    expect(
      await prisma.aiConversation.count({ where: { id: conversation.id } }),
    ).toBe(0);
    expect(await prisma.aiMessage.count({ where: { id: message.id } })).toBe(0);
    expect(
      await prisma.notification.count({ where: { id: notification.id } }),
    ).toBe(0);
    expect(
      await prisma.refreshToken.count({ where: { userId: registered.user.id } }),
    ).toBe(0);

    await expect(auth.refresh(registered.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    const strategy = new JwtStrategy(
      {
        getOrThrow: () => 'integration-test-secret-at-least-32-bytes',
      } as unknown as ConfigService,
      prisma,
    );
    const verifiedPayload = await jwtService.verifyAsync<{ sub: string }>(
      accessToken,
    );
    await expect(
      strategy.validate(verifiedPayload),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
