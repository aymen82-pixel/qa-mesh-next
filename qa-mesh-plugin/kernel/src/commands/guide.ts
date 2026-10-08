/**
 * `qa-mesh guide [skill[/topic] | topic]` — documentation à la demande
 * (progressive disclosure, sur le modèle de `e2e guide` de tester-army/e2e,
 * Apache-2.0, voir NOTICE).
 *
 *   guide                      liste les skills (nom + description)
 *   guide <skill>              imprime le routeur SKILL.md (sans frontmatter)
 *   guide <skill>/<topic>      imprime references/<topic>.md
 *   guide <topic>              raccourci si un seul skill a ce topic
 *
 * Un agent lit ainsi UN topic au lieu de charger tout le pack. Fonctionne sur
 * tous les runtimes (codex, gemini, copilot n'ont pas de chargement de skills).
 * Skills : `$QA_SKILLS_DIR`, sinon `<racine>/.claude/skills`.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findQaDir, repoRoot } from "../paths";

export interface GuideOptions {
  topic?: string;
  json?: boolean;
  qaDir?: string;
  skillsDir?: string;
}

interface Skill {
  name: string;
  description: string;
  dir: string;
  topics: string[];
}

function frontmatter(text: string): { meta: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([a-zA-Z_-]+):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  return { meta, body: text.slice(m[0].length) };
}

export function listSkills(skillsDir: string): Skill[] {
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(skillsDir, d.name, "SKILL.md")))
    .map((d) => {
      const dir = join(skillsDir, d.name);
      const { meta } = frontmatter(readFileSync(join(dir, "SKILL.md"), "utf8"));
      const refs = join(dir, "references");
      const topics = existsSync(refs)
        ? readdirSync(refs).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, "")).sort()
        : [];
      return { name: d.name, description: meta.description ?? "", dir, topics };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function runGuide(opts: GuideOptions): { exitCode: number; stdout: string } {
  const skillsDir =
    opts.skillsDir ?? process.env.QA_SKILLS_DIR ?? join(repoRoot(opts.qaDir ?? findQaDir()), ".claude", "skills");
  const skills = listSkills(skillsDir);
  const fail = (msg: string) => ({ exitCode: 2, stdout: opts.json ? JSON.stringify({ error: msg }) : msg });

  if (!opts.topic) {
    if (opts.json) return { exitCode: 0, stdout: JSON.stringify(skills.map(({ dir: _d, ...s }) => s)) };
    const lines = ["Skills (qa-mesh guide <skill> pour le routeur, <skill>/<topic> pour un topic) :", ""];
    for (const s of skills) {
      lines.push(`- ${s.name}${s.topics.length ? ` [${s.topics.join(", ")}]` : ""}`);
      lines.push(`    ${s.description.slice(0, 200)}${s.description.length > 200 ? "…" : ""}`);
    }
    return { exitCode: 0, stdout: lines.join("\n") };
  }

  const [skillName, topic] = opts.topic.includes("/") ? opts.topic.split("/", 2) : [opts.topic, undefined];
  let skill = skills.find((s) => s.name === skillName);
  let topicName = topic;
  if (!skill && !topic) {
    // Raccourci : `guide locators` -> le seul skill qui a ce topic.
    const owners = skills.filter((s) => s.topics.includes(skillName));
    if (owners.length === 1) {
      skill = owners[0];
      topicName = skillName;
    } else if (owners.length > 1) {
      return fail(`guide : topic "${skillName}" ambigu, préciser : ${owners.map((o) => `${o.name}/${skillName}`).join(", ")}`);
    }
  }
  if (!skill) return fail(`guide : "${opts.topic}" inconnu. Skills : ${skills.map((s) => s.name).join(", ")}`);

  if (!topicName) {
    const { body } = frontmatter(readFileSync(join(skill.dir, "SKILL.md"), "utf8"));
    return { exitCode: 0, stdout: body.trimEnd() };
  }
  if (!skill.topics.includes(topicName)) {
    return fail(`guide : topic "${topicName}" absent de ${skill.name}. Topics : ${skill.topics.join(", ") || "aucun"}`);
  }
  return { exitCode: 0, stdout: readFileSync(join(skill.dir, "references", `${topicName}.md`), "utf8").trimEnd() };
}
