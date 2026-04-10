import prisma from '../../config/database';
import { AppError } from '../../utils/errors';
import fs from 'fs';
import path from 'path';

export async function createAttachment(
  userId: string,
  businessId: string,
  file: Express.Multer.File,
  stepId?: string,
) {
  // Проверяем принадлежность бизнеса
  const business = await prisma.business.findFirst({ where: { id: businessId, userId } });
  if (!business) throw new AppError('Бизнес-проект не найден', 404);

  const attachment = await prisma.attachment.create({
    data: {
      businessId,
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: file.path,
    },
  });

  // Привязываем к шагу, если указан
  if (stepId) {
    const step = await prisma.roadmapStep.findFirst({
      where: { id: stepId, roadmap: { businessId } },
    });
    if (step) {
      await prisma.stepAttachment.create({
        data: { stepId, attachmentId: attachment.id },
      });
    }
  }

  return attachment;
}

export async function getAttachments(userId: string, businessId: string) {
  const business = await prisma.business.findFirst({ where: { id: businessId, userId } });
  if (!business) throw new AppError('Бизнес-проект не найден', 404);

  return prisma.attachment.findMany({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function deleteAttachment(userId: string, attachmentId: string) {
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    include: { business: true },
  });

  if (!attachment || attachment.business.userId !== userId) {
    throw new AppError('Файл не найден', 404);
  }

  // Удаляем файл с диска
  const filePath = path.resolve(attachment.path);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  await prisma.attachment.delete({ where: { id: attachmentId } });
}
