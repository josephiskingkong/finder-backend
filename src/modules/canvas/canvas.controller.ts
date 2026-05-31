import { Request, Response } from 'express';
import * as canvasService from './canvas.service';
import { sendSuccess } from '../../utils/response';

export async function getCanvasHandler(req: Request, res: Response) {
  const businessId = req.params.businessId as string;
  const canvas = await canvasService.getCanvas(req.user!.userId, businessId);
  sendSuccess(res, canvas);
}

export async function updateCanvasHandler(req: Request, res: Response) {
  const businessId = req.params.businessId as string;
  const canvas = await canvasService.updateCanvas(req.user!.userId, businessId, req.body);
  sendSuccess(res, canvas);
}

export async function generateCanvasHandler(req: Request, res: Response) {
  const businessId = req.params.businessId as string;
  const canvas = await canvasService.generateCanvas(req.user!.userId, businessId, 'manual');
  sendSuccess(res, canvas);
}
