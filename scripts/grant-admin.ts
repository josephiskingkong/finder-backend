/**
 * Назначает указанного пользователя администратором (роль ADMIN) и автоматически
 * выдаёт ему PREMIUM-подписку без срока окончания.
 *
 * Запуск:
 *   npx tsx scripts/grant-admin.ts user@example.com
 */
import prisma from '../src/config/database';

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Использование: npx tsx scripts/grant-admin.ts <email>');
    process.exit(1);
  }

  const user = await prisma.user.update({
    where: { email },
    data: {
      role: 'ADMIN',
      subscription: 'PREMIUM',
      subscriptionUntil: null,
      isBlocked: false,
    },
    select: { id: true, email: true, role: true, subscription: true },
  });

  console.log('✔ Назначен ADMIN:', user);
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Ошибка:', err);
  process.exit(1);
});
