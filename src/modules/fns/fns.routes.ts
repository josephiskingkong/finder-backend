import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import * as fnsController from './fns.controller';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

router.use(authMiddleware);

// Поиск по ИНН
router.get('/search/inn/:inn', asyncHandler(fnsController.searchByInnHandler));

// Поиск по ОГРН
router.get('/search/ogrn/:ogrn', asyncHandler(fnsController.searchByOgrnHandler));

// Поиск по названию
router.get('/search/name', asyncHandler(fnsController.searchByNameHandler));

// Подробности о компании
router.get('/company/:inn', asyncHandler(fnsController.getCompanyDetailsHandler));

// Популярные коды ОКВЭД
router.get('/okved/popular', asyncHandler(fnsController.getOkvedCodesHandler));

export default router;
