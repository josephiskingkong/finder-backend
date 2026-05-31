import { z } from 'zod';

export const createHypothesisSchema = z.object({
  businessId: z.string().uuid(),
  statement: z.string().min(1, 'Гипотеза не может быть пустой'),
  category: z.enum(['problem', 'solution', 'value', 'price', 'channel', 'other']),
  priority: z.number().int().min(1).max(5).default(3),
});

export const updateHypothesisSchema = z.object({
  statement: z.string().min(1).optional(),
  category: z.enum(['problem', 'solution', 'value', 'price', 'channel', 'other']).optional(),
  priority: z.number().int().min(1).max(5).optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'REJECTED', 'PARTIALLY']).optional(),
  evidenceSummary: z.string().optional(),
});

export const addQuestionSchema = z.object({
  question: z.string().min(1, 'Вопрос не может быть пустым'),
  questionType: z.enum(['open', 'yes_no', 'scale']).default('open'),
  order: z.number().int().default(0),
});

export const recordFindingSchema = z.object({
  interviewee: z.string().min(1, 'Укажите имя респондента'),
  notes: z.string().optional(),
  verdict: z.enum(['confirmed', 'rejected', 'unclear']),
});

export const generateHypothesesSchema = z.object({
  businessId: z.string().uuid(),
  count: z.number().int().min(5).max(20).default(10),
});

export type CreateHypothesisInput = z.infer<typeof createHypothesisSchema>;
export type UpdateHypothesisInput = z.infer<typeof updateHypothesisSchema>;
export type AddQuestionInput = z.infer<typeof addQuestionSchema>;
export type RecordFindingInput = z.infer<typeof recordFindingSchema>;
export type GenerateHypothesesInput = z.infer<typeof generateHypothesesSchema>;
