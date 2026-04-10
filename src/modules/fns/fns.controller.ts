import { Request, Response } from 'express';
import * as fnsService from './fns.service';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../utils/errors';

export async function searchByInnHandler(req: Request, res: Response) {
  const inn = req.params.inn as string;
  const results = await fnsService.searchByInn(inn);
  sendSuccess(res, results);
}

export async function searchByOgrnHandler(req: Request, res: Response) {
  const ogrn = req.params.ogrn as string;
  const results = await fnsService.searchByOgrn(ogrn);
  sendSuccess(res, results);
}

export async function searchByNameHandler(req: Request, res: Response) {
  const name = req.query.name;
  if (!name || typeof name !== 'string') {
    throw new AppError('Параметр name обязателен', 400);
  }
  const results = await fnsService.searchByName(name);
  sendSuccess(res, results);
}

export async function getCompanyDetailsHandler(req: Request, res: Response) {
  const inn = req.params.inn as string;
  const details = await fnsService.getCompanyDetails(inn);
  if (!details) {
    throw new AppError('Компания не найдена', 404);
  }
  sendSuccess(res, details);
}

export async function getOkvedCodesHandler(_req: Request, res: Response) {
  const codes = fnsService.getPopularOkvedCodes();
  sendSuccess(res, codes);
}
