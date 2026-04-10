import { z } from 'zod';

export const generateRoadmapSchema = z.object({
  businessId: z.string().uuid(),
});

export const reportStepSchema = z.object({
  report: z.string().min(1, 'Отчёт не может быть пустым'),
  success: z.boolean(),
  feedback: z.string().optional(),
});

export type GenerateRoadmapInput = z.infer<typeof generateRoadmapSchema>;
export type ReportStepInput = z.infer<typeof reportStepSchema>;
