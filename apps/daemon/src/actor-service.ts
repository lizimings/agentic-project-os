import { randomUUID } from "node:crypto";
import type { Actor, CreateActorInput, UpdateActorInput } from "@pcc/contracts";
import { ActorRepository, CoreRepository } from "@pcc/database";
import { createCoreEvent, type CoreActor } from "@pcc/domain";
import { EntityConflictError } from "./core-service.js";
import { EventBroker } from "./event-broker.js";
import { EntityNotFoundError } from "./inbox-service.js";

export class ActorService {
  constructor(private readonly repository: ActorRepository, private readonly core: CoreRepository, private readonly events: EventBroker) {}

  list(kind?: Actor["kind"]) { return this.repository.list(kind); }
  async get(id: string) {
    const actor = await this.repository.get(id);
    if (!actor) throw new EntityNotFoundError("Actor", id);
    return actor;
  }
  async create(input: CreateActorInput, acting: CoreActor, correlationId: string) {
    const id = input.id ?? randomUUID();
    if (await this.repository.get(id)) throw new EntityConflictError("相同 ID 的负责人或 Agent 已存在");
    const event = createCoreEvent("actor", id, "created", acting, correlationId, { kind: input.kind, provider: input.provider });
    const actor = await this.repository.database.transaction().execute(async (transaction) => {
      const created = await this.repository.create(id, input, transaction);
      await this.core.appendEvent(event, transaction);
      return created;
    });
    if (!actor) throw new EntityNotFoundError("Actor", id);
    this.events.publish(event);
    return actor;
  }
  async update(id: string, input: UpdateActorInput, acting: CoreActor, correlationId: string) {
    await this.get(id);
    const event = createCoreEvent("actor", id, "updated", acting, correlationId, { changedFields: Object.keys(input) });
    const actor = await this.repository.database.transaction().execute(async (transaction) => {
      const updated = await this.repository.update(id, input, transaction);
      await this.core.appendEvent(event, transaction);
      return updated;
    });
    if (!actor) throw new EntityNotFoundError("Actor", id);
    this.events.publish(event);
    return actor;
  }
}
