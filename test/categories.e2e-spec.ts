import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { UsersService } from '../src/users/users.service';
import { CategoriesService } from '../src/categories/categories.service';

describe('Category API (e2e)', () => {
  let app: INestApplication<App>;
  const categoryId = '11111111-1111-4111-8111-111111111111';
  const category = {
    id: categoryId,
    name: 'Work',
    color: '#2563EB',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  const categoriesService = {
    create: jest.fn(),
    list: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) => ({ id: where.id }),
    );
    categoriesService.create.mockResolvedValue(category);
    categoriesService.list.mockResolvedValue({
      items: [category],
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
    });
    categoriesService.findById.mockResolvedValue(category);
    categoriesService.update.mockResolvedValue(category);
    categoriesService.remove.mockResolvedValue(undefined);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(AuthService)
      .useValue({})
      .overrideProvider(UsersService)
      .useValue({})
      .overrideProvider(CategoriesService)
      .useValue(categoriesService)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  async function accessTokenFor(userId: string): Promise<string> {
    return app.get(JwtService).signAsync({ sub: userId });
  }

  it('requires authentication for every category endpoint', async () => {
    await request(app.getHttpServer()).post('/api/v1/categories').send({ name: 'Work' }).expect(401);
    await request(app.getHttpServer()).get('/api/v1/categories').expect(401);
    await request(app.getHttpServer()).get(`/api/v1/categories/${categoryId}`).expect(401);
    await request(app.getHttpServer()).patch(`/api/v1/categories/${categoryId}`).send({ name: 'Personal' }).expect(401);
    await request(app.getHttpServer()).delete(`/api/v1/categories/${categoryId}`).expect(401);
  });

  it('rejects invalid and expired JWTs', async () => {
    const expired = await app.get(JwtService).signAsync({ sub: 'user-1' }, { expiresIn: -1 });
    await request(app.getHttpServer()).get('/api/v1/categories').set('Authorization', 'Bearer invalid').expect(401);
    await request(app.getHttpServer()).get('/api/v1/categories').set('Authorization', `Bearer ${expired}`).expect(401);
  });

  it('creates a category through the envelope and JWT subject', async () => {
    const token = await accessTokenFor('user-a');
    await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Work', color: '#fff' })
      .expect(201)
      .expect({
        success: true,
        message: 'Request successful',
        data: category,
      });
    expect(categoriesService.create).toHaveBeenCalledWith('user-a', {
      name: 'Work',
      color: '#fff',
    });
  });

  it('lists owned categories with pagination', async () => {
    const token = await accessTokenFor('user-a');
    await request(app.getHttpServer())
      .get('/api/v1/categories?page=2&pageSize=50')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect({
        success: true,
        message: 'Request successful',
        data: {
          items: [category],
          page: 1,
          pageSize: 20,
          totalItems: 1,
          totalPages: 1,
        },
      });
    expect(categoriesService.list).toHaveBeenCalledWith('user-a', {
      page: 2,
      pageSize: 50,
    });
  });

  it('returns an owned category without sensitive fields', async () => {
    const token = await accessTokenFor('user-a');
    await request(app.getHttpServer())
      .get(`/api/v1/categories/${categoryId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((response) => {
        expect(categoriesService.findById).toHaveBeenCalledWith('user-a', categoryId);
        expect(response.body.data).not.toHaveProperty('userId');
        expect(response.body.data).not.toHaveProperty('password');
      });
  });

  it('updates and deletes only through the JWT subject', async () => {
    const token = await accessTokenFor('user-a');
    await request(app.getHttpServer())
      .patch(`/api/v1/categories/${categoryId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Personal', color: null })
      .expect(200);
    expect(categoriesService.update).toHaveBeenCalledWith('user-a', categoryId, {
      name: 'Personal',
      color: null,
    });

    await request(app.getHttpServer())
      .delete(`/api/v1/categories/${categoryId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect({
        success: true,
        message: 'Request successful',
        data: { message: 'Category deleted successfully.' },
      });
    expect(categoriesService.remove).toHaveBeenCalledWith('user-a', categoryId);
  });

  it('rejects a client-supplied userId and invalid category fields', async () => {
    const token = await accessTokenFor('user-a');
    await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Work', userId: 'user-b' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '   ' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Work', color: 'blue' })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/v1/categories/${categoryId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ unknownField: true })
      .expect(400);
    expect(categoriesService.create).not.toHaveBeenCalled();
    expect(categoriesService.update).not.toHaveBeenCalled();
  });

  it('rejects a non-UUID category ID before calling the service', async () => {
    const token = await accessTokenFor('user-a');
    await request(app.getHttpServer())
      .get('/api/v1/categories/not-a-uuid')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(categoriesService.findById).not.toHaveBeenCalled();
  });
});
