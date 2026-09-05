import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/database/prisma-client.js';

async function main(): Promise<void> {
  await prisma.project.upsert({
    where: { key: 'default' },
    update: {},
    create: {
      key: 'default',
      title: 'پروژه پیش‌فرض',
      description: '',
      isActive: true
    }
  });

  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash: bcrypt.hashSync('Admin@123', 12),
      fullName: 'مدیر سامانه',
      role: 'admin'
    }
  });

  await prisma.user.upsert({
    where: { username: 'user' },
    update: {},
    create: {
      username: 'user',
      passwordHash: bcrypt.hashSync('User@123', 12),
      fullName: 'کاربر آزمایشی',
      role: 'user'
    }
  });

  await prisma.ticketServiceSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      url: ''
    }
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
