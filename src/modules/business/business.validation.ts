import { z } from 'zod';

export const createBusinessSchema = z.object({
  title: z.string().min(1, 'Название обязательно'),
  description: z.string().optional(),
  industry: z.string().optional(),
  problemStatement: z.string().optional(),
  targetAudience: z.string().optional(),
  isExistingBusiness: z.boolean().optional(),
});

export const updateBusinessSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  industry: z.string().optional(),
  problemStatement: z.string().optional(),
  targetAudience: z.string().optional(),
  uniqueValue: z.string().optional(),
  competitors: z.string().optional(),
  monetizationModel: z.string().optional(),
  marketSize: z.string().optional(),
  hypotheses: z.string().optional(),
  interviewResults: z.string().optional(),
  mvpDescription: z.string().optional(),
  inn: z.string().optional(),
  ogrn: z.string().optional(),
  legalForm: z.string().optional(),
  taxSystem: z.string().optional(),
  okvedCodes: z.string().optional(),
});

export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;
export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;
