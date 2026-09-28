import { useState } from "react";
import { LinkSimple, Plus, X } from "@phosphor-icons/react";

function mentionOptions(projects) {
  return projects.flatMap((project) => [
    { type: "project", id: project.id, label: `@项目/${project.name}`, projectId: project.id },
    ...(project.milestones || []).filter((item) => item.status !== "archived").map((item) => ({ type: "milestone", id: item.id, label: `@里程碑/${item.title}`, projectId: project.id })),
    ...(project.plans || []).filter((item) => item.status !== "archived").map((item) => ({ type: "plan", id: item.id, label: `@计划/${item.title}`, projectId: project.id })),
    ...(project.tasks || []).filter((item) => item.status !== "archived").map((item) => ({ type: "task", id: item.id, label: `@任务/${item.title}`, projectId: project.id })),
    ...(project.ideas || []).filter((item) => item.status !== "archived").map((item) => ({ type: "idea", id: item.id, label: `@想法/${item.title}`, projectId: project.id })),
  ]);
}

export function EntityMentionPicker({ projects = [], value, onChange, compact = false }) {
  const [candidate, setCandidate] = useState("");
  const options = mentionOptions(projects).filter((option) => !value.some((item) => item.type === option.type && item.id === option.id));
  const add = () => {
    const selected = options.find((option) => `${option.type}:${option.id}` === candidate);
    if (!selected) return;
    onChange([...value, selected]);
    setCandidate("");
  };
  return (
    <section className={`mention-picker ${compact ? "compact" : ""}`}>
      <div><LinkSimple size={14} /><strong>@ 双向关联</strong><select aria-label="@ 关联实体" value={candidate} onChange={(event) => setCandidate(event.target.value)}><option value="">选择项目实体…</option>{projects.filter((project) => project.status !== "archived").map((project) => <optgroup label={project.name} key={project.id}>{options.filter((option) => option.projectId === project.id).map((option) => <option key={`${option.type}:${option.id}`} value={`${option.type}:${option.id}`}>{option.label}</option>)}</optgroup>)}</select><button type="button" disabled={!candidate} onClick={add}><Plus size={13} />关联</button></div>
      {value.length > 0 && <div className="mention-chips">{value.map((mention) => <span key={`${mention.type}:${mention.id}`}><LinkSimple size={12} />{mention.label}<button type="button" aria-label={`移除${mention.label}`} onClick={() => onChange(value.filter((item) => item !== mention))}><X size={11} /></button></span>)}</div>}
    </section>
  );
}
