import { z } from "zod";

export const urlSchema = z
  .string()
  .trim()
  .url("URL inválida (ex: https://exemplo.com)")
  .max(2048, "URL muito longa");

export const optionalUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => v === "" || /^https?:\/\//i.test(v), "URL deve começar com http(s)://")
  .optional()
  .or(z.literal(""));

export const contentSchema = z.object({
  title: z.string().trim().min(3, "Mínimo 3 caracteres").max(120),
  description: z.string().trim().max(280).optional().or(z.literal("")),
  ctaText: z.string().trim().min(1, "Obrigatório").max(40),
  targetUrl: optionalUrlSchema,
  linkOpenTarget: z.enum(["_blank", "_self"]).default("_blank"),
});

export const mediaSchema = z.object({
  imageUrl: urlSchema,
});

export type Gender = "all" | "male" | "female" | "nonbinary";
export const targetingSchema = z.object({
  ageMin: z.number().int().min(18).max(99).default(18),
  ageMax: z.number().int().min(18).max(99).default(65),
  genders: z.array(z.enum(["all", "male", "female", "nonbinary"])).default(["all"]),
  cities: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  states: z.array(z.string().trim().length(2)).max(27).default([]),
  radiusKm: z.number().int().min(0).max(2000).default(0),
  interests: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});

export const scheduleSchema = z.object({
  startsAt: z.string(), // ISO
  endsAt: z.string().optional().or(z.literal("")),
  weekdays: z.array(z.number().int().min(0).max(6)).default([]), // vazio = todos
  hourStart: z.string().regex(/^\d{2}:\d{2}$/).default("00:00"),
  hourEnd: z.string().regex(/^\d{2}:\d{2}$/).default("23:59"),
  recurrence: z.enum(["none", "daily", "weekly"]).default("none"),
});

export type AdContent = z.infer<typeof contentSchema>;
export type AdMedia = z.infer<typeof mediaSchema>;
export type AdTargeting = z.infer<typeof targetingSchema>;
export type AdSchedule = z.infer<typeof scheduleSchema>;

export const WEEKDAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

export interface AdDraftState {
  templateId: string | null;
  templatePayload: Record<string, any>;
  content: AdContent;
  media: AdMedia;
  targeting: AdTargeting;
  schedule: AdSchedule;
  placement: "feed" | "sidebar" | "banner" | "modal";
  priority: number;
  isActive: boolean;
}

export function defaultDraft(): AdDraftState {
  const now = new Date();
  return {
    templateId: null,
    templatePayload: {},
    content: {
      title: "",
      description: "",
      ctaText: "Saiba Mais",
      targetUrl: "",
      linkOpenTarget: "_blank",
    },
    media: { imageUrl: "" },
    targeting: {
      ageMin: 18,
      ageMax: 65,
      genders: ["all"],
      cities: [],
      states: [],
      radiusKm: 0,
      interests: [],
    },
    schedule: {
      startsAt: now.toISOString(),
      endsAt: "",
      weekdays: [],
      hourStart: "00:00",
      hourEnd: "23:59",
      recurrence: "none",
    },
    placement: "feed",
    priority: 0,
    isActive: true,
  };
}
