import { Request, Response } from 'express';
import { z } from 'zod';
import * as adminService from './admin.service';
import { sendSuccess, sendNoContent } from '../../utils/response';

const planEnum = z.enum(['FREE', 'PLUS', 'PREMIUM']);
const roleEnum = z.enum(['USER', 'ADMIN']);

const listQuerySchema = z.object({
  search: z.string().optional(),
  plan: planEnum.optional(),
  role: roleEnum.optional(),
  blocked: z.union([z.literal('true'), z.literal('false')]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const updateSubscriptionSchema = z.object({
  plan: planEnum,
  /// ISO-строка или null. Для FREE сервис игнорирует значение и ставит null.
  until: z.union([z.string().datetime(), z.null()]).optional(),
});

const updateRoleSchema = z.object({ role: roleEnum });
const updateBlockedSchema = z.object({ blocked: z.boolean() });

export async function listUsersHandler(req: Request, res: Response) {
  const q = listQuerySchema.parse(req.query);
  const result = await adminService.listUsers({
    search: q.search,
    plan: q.plan,
    role: q.role,
    blocked: q.blocked === undefined ? undefined : q.blocked === 'true',
    page: q.page,
    pageSize: q.pageSize,
  });
  sendSuccess(res, result);
}

export async function getUserHandler(req: Request, res: Response) {
  const user = await adminService.getUserDetails(req.params.id as string);
  sendSuccess(res, user);
}

export async function updateSubscriptionHandler(req: Request, res: Response) {
  const body = updateSubscriptionSchema.parse(req.body);
  const until = body.until ? new Date(body.until) : null;
  const user = await adminService.updateSubscription(req.params.id as string, body.plan, until);
  sendSuccess(res, user);
}

export async function updateRoleHandler(req: Request, res: Response) {
  const body = updateRoleSchema.parse(req.body);
  const user = await adminService.updateRole(req.user!.userId, req.params.id as string, body.role);
  sendSuccess(res, user);
}

export async function updateBlockedHandler(req: Request, res: Response) {
  const body = updateBlockedSchema.parse(req.body);
  const user = await adminService.setBlocked(req.user!.userId, req.params.id as string, body.blocked);
  sendSuccess(res, user);
}

export async function deleteUserHandler(req: Request, res: Response) {
  await adminService.deleteUser(req.user!.userId, req.params.id as string);
  sendNoContent(res);
}

export async function getStatsHandler(_req: Request, res: Response) {
  const stats = await adminService.getStats();
  sendSuccess(res, stats);
}

const updatePlanSchema = z.object({
  messagesPerWindow: z.number().int().min(1).max(100_000).optional(),
  windowHours: z.number().int().min(1).max(168).optional(),
  label: z.string().min(1).max(40).optional(),
  description: z.union([z.string().max(500), z.null()]).optional(),
});

export async function listPlansHandler(_req: Request, res: Response) {
  const plans = await adminService.listPlanConfigs();
  sendSuccess(res, plans);
}

export async function updatePlanHandler(req: Request, res: Response) {
  const plan = (req.params.plan as string)?.toUpperCase();
  if (!['FREE', 'PLUS', 'PREMIUM'].includes(plan)) {
    res.status(400).json({ success: false, error: `Неизвестный план: ${plan}` });
    return;
  }
  const body = updatePlanSchema.parse(req.body);
  const row = await adminService.updatePlanConfig(plan as adminService.SubscriptionPlan, body);
  sendSuccess(res, row);
}

