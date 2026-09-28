import {
  ConvertIdeaSchema,
  CreateEntityLinkSchema,
  CreateIdeaSchema,
  CreateMilestoneSchema,
  CreatePlanSchema,
  CreateProposalSchema,
  CreateProjectSchema,
  CreateTaskSchema,
  EntityTypeSchema,
  IdeaStatusSchema,
  MergeIdeasSchema,
  DecideProposalSchema,
  ProposalStatusSchema,
  UpdateIdeaSchema,
  UpdateMilestoneSchema,
  UpdatePlanSchema,
  UpdateProjectSchema,
  UpdateTaskSchema,
} from "@pcc/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { actorFromRequest, correlationIdFromRequest } from "./actor.js";
import { CoreService } from "./core-service.js";
import { ProposalExecutionService } from "./proposal-execution-service.js";

const ProjectFilterSchema = z.object({ projectId: z.string().min(1).optional() });
const PlanFilterSchema = ProjectFilterSchema.extend({ milestoneId: z.string().uuid().optional() });
const TaskFilterSchema = PlanFilterSchema.extend({ planId: z.string().uuid().optional() });
const IdeaFilterSchema = ProjectFilterSchema.extend({ status: IdeaStatusSchema.optional() });
const LinkFilterSchema = z.object({ entityType: EntityTypeSchema.optional(), entityId: z.string().min(1).optional() }).refine(
  (value) => Boolean(value.entityType) === Boolean(value.entityId),
  { message: "entityType 和 entityId 必须同时提供" },
);
const ProposalFilterSchema = ProjectFilterSchema.extend({ status: ProposalStatusSchema.optional() });

function requestContext(request: FastifyRequest) {
  return [actorFromRequest(request), correlationIdFromRequest(request)] as const;
}

export async function registerCoreRoutes(app: FastifyInstance, core: CoreService, proposalExecution: ProposalExecutionService) {
  app.get("/api/projects", async () => {
    const items = await core.listProjects();
    return { items, total: items.length };
  });
  app.post("/api/projects", async (request, reply) => {
    const input = CreateProjectSchema.parse(request.body);
    return reply.code(201).send(await core.createProject(input, ...requestContext(request)));
  });
  app.get<{ Params: { id: string } }>("/api/projects/:id", async (request) => core.getProject(request.params.id));
  app.patch<{ Params: { id: string } }>("/api/projects/:id", async (request) => core.updateProject(request.params.id, UpdateProjectSchema.parse(request.body), ...requestContext(request)));
  app.delete<{ Params: { id: string } }>("/api/projects/:id", async (request) => core.updateProject(request.params.id, { status: "archived" }, ...requestContext(request)));

  app.get("/api/milestones", async (request) => {
    const query = ProjectFilterSchema.parse(request.query);
    const items = await core.listMilestones(query.projectId);
    return { items, total: items.length };
  });
  app.post("/api/milestones", async (request, reply) => reply.code(201).send(await core.createMilestone(CreateMilestoneSchema.parse(request.body), ...requestContext(request))));
  app.get<{ Params: { id: string } }>("/api/milestones/:id", async (request) => core.getMilestone(request.params.id));
  app.patch<{ Params: { id: string } }>("/api/milestones/:id", async (request) => core.updateMilestone(request.params.id, UpdateMilestoneSchema.parse(request.body), ...requestContext(request)));
  app.delete<{ Params: { id: string } }>("/api/milestones/:id", async (request) => core.updateMilestone(request.params.id, { status: "archived" }, ...requestContext(request)));

  app.get("/api/plans", async (request) => {
    const query = PlanFilterSchema.parse(request.query);
    const items = await core.listPlans({
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.milestoneId ? { milestoneId: query.milestoneId } : {}),
    });
    return { items, total: items.length };
  });
  app.post("/api/plans", async (request, reply) => reply.code(201).send(await core.createPlan(CreatePlanSchema.parse(request.body), ...requestContext(request))));
  app.get<{ Params: { id: string } }>("/api/plans/:id", async (request) => core.getPlan(request.params.id));
  app.patch<{ Params: { id: string } }>("/api/plans/:id", async (request) => core.updatePlan(request.params.id, UpdatePlanSchema.parse(request.body), ...requestContext(request)));
  app.delete<{ Params: { id: string } }>("/api/plans/:id", async (request) => core.updatePlan(request.params.id, { status: "archived" }, ...requestContext(request)));

  app.get("/api/tasks", async (request) => {
    const query = TaskFilterSchema.parse(request.query);
    const items = await core.listTasks({
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.milestoneId ? { milestoneId: query.milestoneId } : {}),
      ...(query.planId ? { planId: query.planId } : {}),
    });
    return { items, total: items.length };
  });
  app.post("/api/tasks", async (request, reply) => reply.code(201).send(await core.createTask(CreateTaskSchema.parse(request.body), ...requestContext(request))));
  app.get<{ Params: { id: string } }>("/api/tasks/:id", async (request) => core.getTask(request.params.id));
  app.patch<{ Params: { id: string } }>("/api/tasks/:id", async (request) => core.updateTask(request.params.id, UpdateTaskSchema.parse(request.body), ...requestContext(request)));
  app.delete<{ Params: { id: string } }>("/api/tasks/:id", async (request) => core.updateTask(request.params.id, { status: "archived" }, ...requestContext(request)));

  app.get("/api/ideas", async (request) => {
    const query = IdeaFilterSchema.parse(request.query);
    const items = await core.listIdeas({
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.status ? { status: query.status } : {}),
    });
    return { items, total: items.length };
  });
  app.post("/api/ideas", async (request, reply) => reply.code(201).send(await core.createIdea(CreateIdeaSchema.parse(request.body), ...requestContext(request))));
  app.get("/api/ideas/duplicates", async (request) => {
    const query = ProjectFilterSchema.required({ projectId: true }).parse(request.query);
    const items = await core.findIdeaDuplicates(query.projectId);
    return { items, total: items.length };
  });
  app.get<{ Params: { id: string } }>("/api/ideas/:id", async (request) => core.getIdea(request.params.id));
  app.patch<{ Params: { id: string } }>("/api/ideas/:id", async (request) => core.updateIdea(request.params.id, UpdateIdeaSchema.parse(request.body), ...requestContext(request)));
  app.delete<{ Params: { id: string } }>("/api/ideas/:id", async (request) => core.updateIdea(request.params.id, { status: "archived" }, ...requestContext(request)));
  app.post<{ Params: { id: string } }>("/api/ideas/:id/convert", async (request, reply) => reply.code(201).send(await core.convertIdea(request.params.id, ConvertIdeaSchema.parse(request.body), ...requestContext(request))));
  app.post<{ Params: { id: string } }>("/api/ideas/:id/merge", async (request) => core.mergeIdeas(request.params.id, MergeIdeasSchema.parse(request.body), ...requestContext(request)));

  app.get("/api/entity-links", async (request) => {
    const query = LinkFilterSchema.parse(request.query);
    const items = await core.listLinks(query.entityType && query.entityId ? { entityType: query.entityType, entityId: query.entityId } : {});
    return { items, total: items.length };
  });
  app.post("/api/entity-links", async (request, reply) => reply.code(201).send(await core.createLink(CreateEntityLinkSchema.parse(request.body), ...requestContext(request))));
  app.delete<{ Params: { id: string } }>("/api/entity-links/:id", async (request, reply) => {
    await core.deleteLink(request.params.id, ...requestContext(request));
    return reply.code(204).send();
  });

  app.get("/api/proposals", async (request) => {
    const query = ProposalFilterSchema.parse(request.query);
    const items = await core.listProposals({
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.status ? { status: query.status } : {}),
    });
    return { items, total: items.length };
  });
  app.post("/api/proposals", async (request, reply) => reply.code(201).send(await core.createProposal(CreateProposalSchema.parse(request.body), ...requestContext(request))));
  app.get<{ Params: { id: string } }>("/api/proposals/:id", async (request) => core.getProposal(request.params.id));
  app.post<{ Params: { id: string } }>("/api/proposals/:id/decide", async (request) => proposalExecution.decide(request.params.id, DecideProposalSchema.parse(request.body), ...requestContext(request)));
}
