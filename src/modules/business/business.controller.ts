import { Request, Response } from 'express';
import * as businessService from './business.service';
import * as competitorsService from './competitors.service';
import { createBusinessSchema, updateBusinessSchema } from './business.validation';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';

export async function createBusinessHandler(req: Request, res: Response) {
  const input = createBusinessSchema.parse(req.body);
  const business = await businessService.createBusiness(req.user!.userId, input);
  sendCreated(res, business);
}

export async function getBusinessesHandler(req: Request, res: Response) {
  const businesses = await businessService.getBusinesses(req.user!.userId);
  sendSuccess(res, businesses);
}

export async function getBusinessHandler(req: Request, res: Response) {
  const business = await businessService.getBusinessById(req.user!.userId, req.params.id as string);
  sendSuccess(res, business);
}

export async function updateBusinessHandler(req: Request, res: Response) {
  const input = updateBusinessSchema.parse(req.body);
  const business = await businessService.updateBusiness(req.user!.userId, req.params.id as string, input);
  sendSuccess(res, business);
}

export async function deleteBusinessHandler(req: Request, res: Response) {
  await businessService.deleteBusiness(req.user!.userId, req.params.id as string);
  sendNoContent(res);
}

export async function analyzeCompetitorsHandler(req: Request, res: Response) {
  const businessId = req.params.id as string;
  const extraHint = typeof req.body?.hint === 'string' ? req.body.hint : undefined;
  const aiTier = (req.body?.aiTier === 'PLUS' || req.body?.aiTier === 'PREMIUM') ? req.body.aiTier : undefined;
  const result = await competitorsService.analyzeCompetitorsForBusiness(
    req.user!.userId,
    businessId,
    { extraHint, aiTier },
  );
  sendSuccess(res, result);
}

export async function updateEntrepreneurTypeHandler(req: Request, res: Response) {
  const { type } = req.body;
  if (!['DOMAIN_EXPERT', 'COMPLETE_BEGINNER'].includes(type)) {
    return res.status(400).json({ success: false, error: 'Некорректный тип предпринимателя' });
  }
  const profile = await businessService.updateEntrepreneurType(req.user!.userId, type);
  sendSuccess(res, profile);
}
