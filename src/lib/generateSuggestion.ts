import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Client, Page, AuditFlag } from "@/generated/prisma/client";

const anthropic = new Anthropic();

// Sonnet 4.6 chosen over Opus for cost/quality balance at volume (30-40
// clients, hundreds of pages each) — overridable via env.
const MODEL = process.env.SUGGESTION_MODEL || "claude-sonnet-4-6";

const SuggestionSchema = z.object({
  suggestedTitle: z.string().describe("Rewritten title tag, ideally 50-60 characters"),
  suggestedDescription: z
    .string()
    .describe("Rewritten meta description, ideally 140-160 characters"),
  rationale: z.string().describe("1-2 sentence explanation of the changes and why they help"),
});

export type SuggestionResult = z.infer<typeof SuggestionSchema>;

export async function generateSuggestion(
  page: Page,
  flags: AuditFlag[],
  client: Client
): Promise<SuggestionResult | null> {
  const prompt = buildPrompt(page, flags, client);

  const response = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 1024,
    output_config: { format: zodOutputFormat(SuggestionSchema) },
    messages: [{ role: "user", content: prompt }],
  });

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    return null;
  }

  return response.parsed_output;
}

function getTargetKeyword(page: Page, client: Client): string | null {
  const keywordMap = client.keywordMap as Record<string, string> | null;
  if (!keywordMap) return null;
  try {
    return keywordMap[new URL(page.url).pathname] ?? null;
  } catch {
    return null;
  }
}

function buildPrompt(page: Page, flags: AuditFlag[], client: Client): string {
  const targetKeyword = getTargetKeyword(page, client);
  const flagLines = flags.map((f) => `- [${f.severity}] ${f.flagType}: ${f.reason}`).join("\n");

  return `You are an SEO copywriter rewriting a page's title tag and meta description.

Client: ${client.name}
${
  client.brandVoiceProfile
    ? `Brand voice profile:\n${client.brandVoiceProfile}\n`
    : "No brand voice profile provided — use a clear, professional tone.\n"
}
Page URL: ${page.url}
Current title: ${page.currentTitle || "(missing)"}
Current meta description: ${page.currentDescription || "(missing)"}
Current H1: ${page.h1 || "(missing)"}
${targetKeyword ? `Target keyword to naturally include: "${targetKeyword}"\n` : ""}
Issues flagged by the audit:
${flagLines || "(none)"}

Write a new title (aim for 50-60 characters) and meta description (aim for 140-160 characters) that fix these issues while matching the brand voice. Then give a 1-2 sentence rationale for your changes.`;
}
