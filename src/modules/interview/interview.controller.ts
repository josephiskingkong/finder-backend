import { Request, Response } from 'express';
import * as interviewService from './interview.service';
import { sendSuccess, sendNoContent } from '../../utils/response';
import { 
  createHypothesisSchema, 
  updateHypothesisSchema, 
  addQuestionSchema, 
  recordFindingSchema,
  generateHypothesesSchema,
} from './interview.validation';

/**
 * Получить все гипотезы бизнеса
 */
export async function getHypothesesHandler(req: Request, res: Response) {
  const businessId = req.params.businessId as string;
  const result = await interviewService.getHypotheses(req.user!.userId, businessId);
  sendSuccess(res, result);
}

/**
 * Создать гипотезу вручную
 */
export async function createHypothesisHandler(req: Request, res: Response) {
  const body = createHypothesisSchema.parse(req.body);
  const hypothesis = await interviewService.createHypothesis(req.user!.userId, body);
  sendSuccess(res, hypothesis);
}

/**
 * Сгенерировать гипотезы ИИ
 */
export async function generateHypothesesHandler(req: Request, res: Response) {
  const body = generateHypothesesSchema.parse(req.body);
  const result = await interviewService.generateHypotheses(
    req.user!.userId, 
    body.businessId,
    body.count
  );
  sendSuccess(res, result);
}

/**
 * Обновить гипотезу
 */
export async function updateHypothesisHandler(req: Request, res: Response) {
  const body = updateHypothesisSchema.parse(req.body);
  const hypothesis = await interviewService.updateHypothesis(
    req.user!.userId,
    req.params.id as string,
    body
  );
  sendSuccess(res, hypothesis);
}

/**
 * Удалить гипотезу
 */
export async function deleteHypothesisHandler(req: Request, res: Response) {
  await interviewService.deleteHypothesis(req.user!.userId, req.params.id as string);
  sendNoContent(res);
}

/**
 * Получить детали гипотезы
 */
export async function getHypothesisDetailsHandler(req: Request, res: Response) {
  const hypothesis = await interviewService.getHypothesisDetails(
    req.user!.userId,
    req.params.id as string
  );
  sendSuccess(res, hypothesis);
}

/**
 * Добавить вопрос к гипотезе
 */
export async function addQuestionHandler(req: Request, res: Response) {
  const body = addQuestionSchema.parse(req.body);
  const question = await interviewService.addQuestion(
    req.user!.userId,
    req.params.hypothesisId as string,
    body
  );
  sendSuccess(res, question);
}

/**
 * Удалить вопрос
 */
export async function deleteQuestionHandler(req: Request, res: Response) {
  await interviewService.deleteQuestion(req.user!.userId, req.params.id as string);
  sendNoContent(res);
}

/**
 * Записать результат интервью
 */
export async function recordFindingHandler(req: Request, res: Response) {
  const body = recordFindingSchema.parse(req.body);
  const finding = await interviewService.recordFinding(
    req.user!.userId,
    req.params.hypothesisId as string,
    body
  );
  sendSuccess(res, finding);
}
