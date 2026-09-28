import { AttentionAnalysisQuerySchema, CompleteFocusSessionSchema, CreateAttentionRebalanceProposalSchema, CreateTimeBlockSchema, StartFocusSessionSchema, TimeRangeQuerySchema, TimeSummaryQuerySchema, UpdateTimeBlockSchema, UpsertAttentionBudgetSchema } from "@pcc/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { actorFromRequest, correlationIdFromRequest } from "./actor.js";
import { TimeService } from "./time-service.js";

const BudgetQuerySchema = z.object({ weekStart: z.string().date() });
const DeleteBudgetQuerySchema = BudgetQuerySchema.extend({ projectId: z.string().min(1).max(200) });

export async function registerTimeRoutes(app: FastifyInstance, time: TimeService) {
  app.get("/api/time-blocks", async (request) => {
    const items = await time.listBlocks(TimeRangeQuerySchema.parse(request.query));
    return { items, total: items.length };
  });
  app.get("/api/time-summary", async (request) => time.summarizeFocus(TimeSummaryQuerySchema.parse(request.query)));
  app.post("/api/time-blocks", async (request, reply) => reply.code(201).send(await time.createBlock(CreateTimeBlockSchema.parse(request.body), actorFromRequest(request), correlationIdFromRequest(request))));
  app.patch<{ Params: { id: string } }>("/api/time-blocks/:id", async (request) => time.updateBlock(request.params.id, UpdateTimeBlockSchema.parse(request.body), actorFromRequest(request), correlationIdFromRequest(request)));
  app.delete<{ Params: { id: string } }>("/api/time-blocks/:id", async (request) => time.updateBlock(request.params.id, { status: "canceled" }, actorFromRequest(request), correlationIdFromRequest(request)));

  app.get("/api/focus-sessions/current", async () => (await time.getCurrentFocus()) ?? null);
  app.post("/api/focus-sessions", async (request, reply) => reply.code(201).send(await time.startFocus(StartFocusSessionSchema.parse(request.body), actorFromRequest(request), correlationIdFromRequest(request))));
  for (const action of ["pause", "resume"] as const) {
    app.post<{ Params: { id: string } }>(`/api/focus-sessions/:id/${action}`, async (request) => time.transitionFocus(request.params.id, action, actorFromRequest(request), correlationIdFromRequest(request)));
  }
  app.post<{ Params: { id: string } }>("/api/focus-sessions/:id/complete", async (request) => time.transitionFocus(request.params.id, "complete", actorFromRequest(request), correlationIdFromRequest(request), CompleteFocusSessionSchema.parse(request.body ?? {})));

  app.get("/api/attention-budgets", async (request) => {
    const query = BudgetQuerySchema.parse(request.query);
    const items = await time.listBudgets(query.weekStart);
    return { items, total: items.length };
  });
  app.put("/api/attention-budgets", async (request) => time.upsertBudget(UpsertAttentionBudgetSchema.parse(request.body), actorFromRequest(request), correlationIdFromRequest(request)));
  app.delete("/api/attention-budgets", async (request, reply) => {
    const query = DeleteBudgetQuerySchema.parse(request.query);
    await time.removeBudget(query.projectId, query.weekStart, actorFromRequest(request), correlationIdFromRequest(request));
    return reply.code(204).send();
  });
  app.get("/api/attention-analysis", async (request) => time.analyzeAttention(AttentionAnalysisQuerySchema.parse(request.query)));
  app.post("/api/attention-analysis/rebalance", async (request, reply) => reply.code(201).send(await time.proposeAttentionRebalance(CreateAttentionRebalanceProposalSchema.parse(request.body), actorFromRequest(request), correlationIdFromRequest(request))));
}
