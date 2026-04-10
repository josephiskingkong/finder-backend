import { Request, Response } from 'express';
import * as filesService from './files.service';
import { sendSuccess, sendCreated } from '../../utils/response';
import { AppError } from '../../utils/errors';

export async function uploadFileHandler(req: Request, res: Response) {
  if (!req.file) {
    throw new AppError('Файл не предоставлен', 400);
  }
  const { businessId, stepId } = req.body;
  if (!businessId) {
    throw new AppError('businessId обязателен', 400);
  }

  const attachment = await filesService.createAttachment(
    req.user!.userId,
    businessId,
    req.file,
    stepId,
  );
  sendCreated(res, attachment);
}

export async function getFilesHandler(req: Request, res: Response) {
  const files = await filesService.getAttachments(req.user!.userId, req.params.businessId as string);
  sendSuccess(res, files);
}

export async function deleteFileHandler(req: Request, res: Response) {
  await filesService.deleteAttachment(req.user!.userId, req.params.id as string);
  sendSuccess(res, { message: 'Файл удалён' });
}
