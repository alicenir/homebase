import { Router } from "express";
import { z } from "zod";
import { isRequestAuthed } from "../middleware/auth.js";
import { runAssistantTurn } from "../services/assistant.js";

export const assistantRouter = Router();

const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string(),
  toolCalls: z
    .array(z.object({ id: z.string(), name: z.string(), args: z.record(z.string(), z.unknown()) }))
    .optional(),
  toolCallId: z.string().optional(),
  toolName: z.string().optional(),
});

const chatSchema = z.object({
  messages: z.array(messageSchema).min(1),
  approvedCallIds: z.array(z.string()).optional(),
});

// Public like the other read-only status routes — the assistant only ever
// mutates anything through a tool call, and runAssistantTurn itself refuses
// (and reports needs_login) any mutating tool unless the request is authed.
assistantRouter.post("/chat", async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid chat payload" });

  const result = await runAssistantTurn(parsed.data.messages, {
    authed: isRequestAuthed(req),
    approvedCallIds: parsed.data.approvedCallIds ?? [],
  });
  res.json(result);
});
