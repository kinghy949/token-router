import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
    balance: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  } as any;

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    const jwtService = new JwtService({ secret: 'test-secret' });
    service = new AuthService(prisma, jwtService);
  });

  it('hashes password and validates login credentials', async () => {
    const passwordHash = await bcrypt.hash('secret123', 12);

    prisma.user.findUnique.mockResolvedValueOnce(null);
    prisma.$transaction.mockImplementation(async (fn: any) =>
      fn({
        user: {
          create: async () => ({
            id: 'u1',
            email: 'a@b.com',
            passwordHash,
            isAdmin: false,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        },
        balance: {
          create: async () => ({ userId: 'u1', tokens: BigInt(0), updatedAt: new Date() }),
        },
      }),
    );
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      email: 'a@b.com',
      passwordHash,
      isAdmin: false,
      isActive: true,
    });

    const user = await service.register({ email: 'a@b.com', password: 'secret123' });

    expect(user.email).toBe('a@b.com');
    await expect(service.validateUser('a@b.com', 'secret123')).resolves.toBeTruthy();
  });
});
