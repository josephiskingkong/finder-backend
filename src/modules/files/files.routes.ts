import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import * as filesController from './files.controller';
import { upload } from './upload.config';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

router.use(authMiddleware);

// Загрузить файл
router.post('/upload', upload.single('file'), asyncHandler(filesController.uploadFileHandler));

// Получить файлы бизнес-проекта
router.get('/business/:businessId', asyncHandler(filesController.getFilesHandler));

// Удалить файл
router.delete('/:id', asyncHandler(filesController.deleteFileHandler));

export default router;
