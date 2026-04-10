import { Request, Response } from 'express';
import * as roadmapService from './roadmap.service';
import { generateRoadmapSchema, reportStepSchema } from './roadmap.validation';
import { sendSuccess, sendCreated } from '../../utils/response';

export async function generateRoadmapHandler(req: Request, res: Response) {
  const { businessId } = generateRoadmapSchema.parse(req.body);
  const roadmap = await roadmapService.generateRoadmap(req.user!.userId, businessId);
  sendCreated(res, roadmap);
}

export async function getRoadmapHandler(req: Request, res: Response) {
  const roadmap = await roadmapService.getRoadmap(req.user!.userId, req.params.businessId as string);
  sendSuccess(res, roadmap);
}

export async function reportStepHandler(req: Request, res: Response) {
  const input = reportStepSchema.parse(req.body);
  const result = await roadmapService.reportStep(req.user!.userId, req.params.stepId as string, input);
  sendSuccess(res, result);
}

export async function startStepHandler(req: Request, res: Response) {
  const step = await roadmapService.startStep(req.user!.userId, req.params.stepId as string);
  sendSuccess(res, step);
}
