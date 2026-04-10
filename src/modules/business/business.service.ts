import prisma from '../../config/database';
import { AppError } from '../../utils/errors';
import { CreateBusinessInput, UpdateBusinessInput } from './business.validation';

export async function createBusiness(userId: string, input: CreateBusinessInput) {
  const business = await prisma.business.create({
    data: {
      userId,
      title: input.title,
      description: input.description,
      industry: input.industry,
      problemStatement: input.problemStatement,
      targetAudience: input.targetAudience,
      status: input.isExistingBusiness ? 'IDEA_DEFINED' : 'IDEA_GENERATION',
    },
    include: { roadmap: true },
  });

  // Если есть существующий бизнес — обновляем профиль
  if (input.isExistingBusiness) {
    await prisma.entrepreneurProfile.updateMany({
      where: { userId },
      data: { hasExistingBusiness: true },
    });
  }

  return business;
}

export async function getBusinesses(userId: string) {
  return prisma.business.findMany({
    where: { userId },
    include: {
      roadmap: { include: { steps: { orderBy: { order: 'asc' } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getBusinessById(userId: string, businessId: string) {
  const business = await prisma.business.findFirst({
    where: { id: businessId, userId },
    include: {
      roadmap: { include: { steps: { orderBy: { order: 'asc' } } } },
      chats: { orderBy: { updatedAt: 'desc' }, take: 10 },
      files: true,
    },
  });

  if (!business) {
    throw new AppError('Бизнес-проект не найден', 404);
  }

  return business;
}

export async function updateBusiness(userId: string, businessId: string, input: UpdateBusinessInput) {
  const business = await prisma.business.findFirst({ where: { id: businessId, userId } });
  if (!business) {
    throw new AppError('Бизнес-проект не найден', 404);
  }

  return prisma.business.update({
    where: { id: businessId },
    data: input,
    include: { roadmap: true },
  });
}

export async function deleteBusiness(userId: string, businessId: string) {
  const business = await prisma.business.findFirst({ where: { id: businessId, userId } });
  if (!business) {
    throw new AppError('Бизнес-проект не найден', 404);
  }

  await prisma.business.delete({ where: { id: businessId } });
}

export async function updateEntrepreneurType(userId: string, type: 'DOMAIN_EXPERT' | 'COMPLETE_BEGINNER') {
  return prisma.entrepreneurProfile.update({
    where: { userId },
    data: { type },
  });
}
