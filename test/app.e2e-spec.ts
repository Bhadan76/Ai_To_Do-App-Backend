import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from './../src/prisma/prisma.service';
import { AuthService } from './../src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from './../src/users/users.service';

describe('API foundation (e2e)', () => {
  let app: INestApplication<App>;
  const authService = {
    register: jest.fn().mockResolvedValue({
      user: {
        id: 'user-1',
        name: 'Alex Morgan',
        email: 'alex@example.com',
        avatar: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tokenType: 'Bearer',
      expiresIn: 900,
    }),
    login: jest.fn().mockResolvedValue({ accessToken: 'access-token' }),
    refresh: jest.fn().mockResolvedValue({ accessToken: 'access-token' }),
    logout: jest.fn().mockResolvedValue(undefined),
  };
  const usersService = {
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
    changePassword: jest.fn(),
    deleteAccount: jest.fn(),
  };
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
  };
  const publicProfile = {
    id: 'user-from-jwt',
    name: 'Alex Morgan',
    email: 'alex@example.com',
    avatar: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) => ({ id: where.id }),
    );
    usersService.getProfile.mockResolvedValue(publicProfile);
    usersService.updateProfile.mockResolvedValue(publicProfile);
    usersService.changePassword.mockResolvedValue(undefined);
    usersService.deleteAccount.mockResolvedValue(undefined);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(AuthService)
      .useValue(authService)
      .overrideProvider(UsersService)
      .useValue(usersService)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('keeps the existing root endpoint under the versioned API prefix', () => {
    return request(app.getHttpServer())
      .get('/api/v1')
      .expect(200)
      .expect({
        success: true,
        message: 'Request successful',
        data: 'Hello World!',
      });
  });

  it('returns the public health response', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect({
        success: true,
        message: 'Daily Task API is running',
      });
  });

  it('serves Swagger documentation at the configured path', () => {
    return request(app.getHttpServer())
      .get('/api/docs')
      .expect(200)
      .expect('Content-Type', /html/);
  });

  it('returns a consistent 404 response for unknown routes', () => {
    return request(app.getHttpServer())
      .get('/api/v1/does-not-exist')
      .expect(404)
      .expect({
        success: false,
        message: 'Not Found',
        errors: [],
      });
  });

  it('registers through the public auth route', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: 'Alex Morgan',
        email: 'alex@example.com',
        password: 'A-strong-passphrase-2026',
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.data.user).not.toHaveProperty('password');
        expect(response.body.data.accessToken).toBe('access-token');
        expect(authService.register).toHaveBeenCalledTimes(1);
      });
  });

  it('rejects invalid registration DTOs before calling the service', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: 'Alex Morgan',
        email: 'not-an-email',
        password: 'weak',
      })
      .expect(400)
      .expect(() => {
        expect(authService.register).not.toHaveBeenCalled();
      });
  });

  it('rejects weak registration passwords before calling the service', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: 'Alex Morgan',
        email: 'alex@example.com',
        password: 'weak-password',
      })
      .expect(400)
      .expect(() => {
        expect(authService.register).not.toHaveBeenCalled();
      });
  });

  it('logs in through the public auth route', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'alex@example.com',
        password: 'A-strong-passphrase-2026',
      })
      .expect(200)
      .expect((response) => {
        expect(response.body.data.accessToken).toBe('access-token');
        expect(authService.login).toHaveBeenCalledTimes(1);
      });
  });

  it('rotates a refresh token through the public auth route', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'A'.repeat(43) })
      .expect(200)
      .expect((response) => {
        expect(response.body.data.accessToken).toBe('access-token');
        expect(authService.refresh).toHaveBeenCalledWith('A'.repeat(43));
      });
  });

  it('requires authentication for logout', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: 'A'.repeat(43) })
      .expect(401);
  });

  it('rejects expired access tokens on protected auth routes', async () => {
    const jwtService = app.get(JwtService);
    const expiredToken = await jwtService.signAsync(
      { sub: 'user-1' },
      { expiresIn: -1 },
    );

    return request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${expiredToken}`)
      .send({ refreshToken: 'A'.repeat(43) })
      .expect(401);
  });

  it('uses the authenticated JWT identity when logging out', async () => {
    const jwtService = app.get(JwtService);
    const accessToken = await jwtService.signAsync({ sub: 'user-from-jwt' });

    return request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken: 'A'.repeat(43) })
      .expect(200)
      .expect((response) => {
        expect(authService.logout).toHaveBeenCalledWith(
          'A'.repeat(43),
          'user-from-jwt',
        );
        expect(response.body.data.message).toBe('Logged out successfully.');
    });
  });

  it('requires a valid JWT for every user profile endpoint', async () => {
    const expiredToken = await app
      .get(JwtService)
      .signAsync({ sub: 'user-from-jwt' }, { expiresIn: -1 });
    await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .send({ name: 'Updated Name' })
      .expect(401);
    await request(app.getHttpServer())
      .patch('/api/v1/users/me/password')
      .send({
        currentPassword: 'current-password',
        newPassword: 'A-new-strong-passphrase-2026',
      })
      .expect(401);
    await request(app.getHttpServer())
      .delete('/api/v1/users/me')
      .send({ currentPassword: 'current-password', confirmation: 'DELETE' })
      .expect(401);
  });

  it('returns only public profile fields and uses the verified JWT subject', async () => {
    const accessToken = await app
      .get(JwtService)
      .signAsync({ sub: 'user-from-jwt' });

    await request(app.getHttpServer())
      .get('/api/v1/users/me?userId=another-user')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect({
        success: true,
        message: 'Request successful',
        data: publicProfile,
      })
      .expect((response) => {
        expect(usersService.getProfile).toHaveBeenCalledWith('user-from-jwt');
        expect(response.body.data).not.toHaveProperty('password');
        expect(response.body.data).not.toHaveProperty('refreshToken');
        expect(response.body.data).not.toHaveProperty('tokenHash');
      });
  });

  it('updates profile fields for the JWT subject and rejects a client userId', async () => {
    const accessToken = await app
      .get(JwtService)
      .signAsync({ sub: 'user-from-jwt' });

    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Alex Morgan', avatar: null })
      .expect(200)
      .expect({
        success: true,
        message: 'Request successful',
        data: publicProfile,
      });
    expect(usersService.updateProfile).toHaveBeenCalledWith(
      'user-from-jwt',
      { name: 'Alex Morgan', avatar: null },
    );

    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Other', userId: 'another-user' })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ avatar: 'http://cdn.example.test/avatar.png' })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: null })
      .expect(400);
    expect(usersService.updateProfile).toHaveBeenCalledTimes(1);
  });

  it('changes password and deletes the account through the success envelope', async () => {
    const accessToken = await app
      .get(JwtService)
      .signAsync({ sub: 'user-from-jwt' });

    await request(app.getHttpServer())
      .patch('/api/v1/users/me/password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        currentPassword: 'current-password',
        newPassword: 'A-new-strong-passphrase-2026',
      })
      .expect(200)
      .expect({
        success: true,
        message: 'Request successful',
        data: { message: 'Password changed successfully.' },
      });
    expect(usersService.changePassword).toHaveBeenCalledWith(
      'user-from-jwt',
      {
        currentPassword: 'current-password',
        newPassword: 'A-new-strong-passphrase-2026',
      },
    );

    await request(app.getHttpServer())
      .delete('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'current-password', confirmation: 'DELETE' })
      .expect(200)
      .expect({
        success: true,
        message: 'Request successful',
        data: { message: 'Account deleted successfully.' },
      });
    expect(usersService.deleteAccount).toHaveBeenCalledWith('user-from-jwt', {
      currentPassword: 'current-password',
      confirmation: 'DELETE',
    });
  });

  afterEach(async () => {
    await app?.close();
  });
});
