import { z } from "zod";

export const categories = ["Technology", "Creative", "Career", "Community"];
export const idSchema = z.string().uuid();
export const searchSchema = z.object({
  q: z.string().trim().max(100).default(""),
  category: z.enum(categories).or(z.literal("")).default(""),
  sort: z.enum(["date", "title", "seats"]).default("date"),
});
export const sessionSchema = z.object({ idToken: z.string().min(100).max(10000) });
export const eventSchema = z.object({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(20).max(2000),
  category: z.enum(categories),
  venue: z.string().trim().min(3).max(120),
  starts_at: z.iso.datetime({ offset: true }).refine((value) => Date.parse(value) > Date.now(), "Choose a future date and time."),
  capacity: z.coerce.number().int().min(1).max(10000),
});
export const checkInSchema = z.object({ token: z.string().min(32).max(128) });

export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const error = new Error(result.error.issues.map((issue) => issue.message).join(" "));
    error.status = 400;
    throw error;
  }
  return result.data;
}
