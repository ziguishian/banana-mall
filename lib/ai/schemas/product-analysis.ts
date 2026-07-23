import { z } from "zod";

export const productAnalysisOutputSchema = z.object({
  productName: z.string(),
  category: z.string(),
  subcategory: z.string(),
  material: z.string(),
  color: z.string(),
  styleTags: z.array(z.string()),
  targetAudience: z.array(z.string()),
  usageScenarios: z.array(z.string()),
  coreSellingPoints: z.array(z.string()),
  differentiationPoints: z.array(z.string()),
  userConcerns: z.array(z.string()),
  recommendedFocusPoints: z.array(z.string()),
  additionalInformation: z.string().default(""),
  generationRequirements: z.string().default(""),
  suggestedSectionPlan: z.array(
    z.object({
      type: z.string(),
      title: z.string(),
      goal: z.string(),
    }),
  ),
});

export type ProductAnalysisOutput = z.infer<typeof productAnalysisOutputSchema>;
