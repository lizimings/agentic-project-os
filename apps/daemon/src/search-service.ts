import { GlobalSearchEntityTypeSchema, type GlobalSearchQuery, type GlobalSearchResponse, type GlobalSearchResult } from "@pcc/contracts";
import { SearchRepository } from "@pcc/database";

function excerpt(context: string, query: string) {
  const compact = context.replace(/\s+/gu, " ").trim();
  const index = compact.toLocaleLowerCase("zh-CN").indexOf(query.toLocaleLowerCase("zh-CN"));
  const start = Math.max(0, index < 0 ? 0 : index - 48);
  const slice = compact.slice(start, start + 180);
  return `${start > 0 ? "…" : ""}${slice}${start + 180 < compact.length ? "…" : ""}`;
}

export class SearchService {
  constructor(private readonly repository: SearchRepository) {}

  async search(query: GlobalSearchQuery): Promise<GlobalSearchResponse> {
    const types = query.types
      ? query.types.split(",").map((value) => GlobalSearchEntityTypeSchema.parse(value.trim()))
      : undefined;
    const result = await this.repository.search(query.q, {
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(types ? { types } : {}),
      limit: query.limit,
    });
    const normalized = query.q.toLocaleLowerCase("zh-CN");
    const typePenalty: Partial<Record<GlobalSearchResult["entityType"], number>> = { event_log: 420, proposal: 90, canvas_node: 30 };
    const ranked: GlobalSearchResult[] = result.rows.map((row) => {
      const title = row.title.toLocaleLowerCase("zh-CN");
      const score = title === normalized
        ? 1_000
        : title.startsWith(normalized)
          ? 850
          : title.includes(normalized)
            ? 700
            : row.rank !== null
              ? 550 + Math.min(99, Math.round(Math.abs(row.rank) * 10))
              : 350;
      return {
        entityType: row.entity_type,
        entityId: row.entity_id,
        projectId: row.project_id,
        title: row.title,
        context: excerpt(row.context, query.q),
        route: row.route,
        score: Math.max(0, score - (typePenalty[row.entity_type] ?? 0)),
        updatedAt: row.updated_at,
      };
    });
    ranked.sort((left, right) => right.score - left.score || right.updatedAt.localeCompare(left.updatedAt) || left.title.localeCompare(right.title, "zh-CN"));
    return { query: query.q, items: ranked.slice(0, query.limit), total: ranked.length, indexedAt: result.indexedAt };
  }
}
