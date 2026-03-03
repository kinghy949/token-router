import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.log('[seed] 未设置 ADMIN_EMAIL / ADMIN_PASSWORD，跳过管理员初始化');
    return;
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      isAdmin: true,
      isActive: true,
    },
  });

  if (existing) {
    if (!existing.isAdmin || !existing.isActive) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          isAdmin: true,
          isActive: true,
        },
      });
    }

    await prisma.balance.upsert({
      where: { userId: existing.id },
      update: {},
      create: {
        userId: existing.id,
        tokens: BigInt(0),
      },
    });

    console.log(`[seed] 已确认管理员账号存在: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        passwordHash,
        isAdmin: true,
        isActive: true,
      },
    });

    await tx.balance.create({
      data: {
        userId: user.id,
        tokens: BigInt(0),
      },
    });

    return user;
  });

  console.log(`[seed] 已创建初始管理员账号: ${created.email}`);
}

main()
  .catch((error) => {
    console.error('[seed] 执行失败', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
