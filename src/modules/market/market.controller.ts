import { Request, Response } from 'express';
import * as marketService from './market.service';
import { sendSuccess } from '../../utils/response';

export async function getMarketHandler(req: Request, res: Response) {
  const businessId = req.params.businessId as string;
  const data = await marketService.getMarketAnalysis(req.user!.userId, businessId);
  sendSuccess(res, data);
}

export async function generateMarketHandler(req: Request, res: Response) {
  const businessId = req.params.businessId as string;
  const hint = typeof req.body?.hint === 'string' ? req.body.hint : undefined;
  const data = await marketService.generateMarketAnalysis(req.user!.userId, businessId, hint);
  sendSuccess(res, data);
}
