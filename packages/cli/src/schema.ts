import { createHash } from "node:crypto";
import { z } from "zod";
import { AppError } from "./errors.js";

export const agentSchema = z.enum(["codex", "claude"]);
export type Agent = z.infer<typeof agentSchema>;
export const agentPaths: Record<Agent, string> = {
  codex: ".agents/skills",
  claude: ".claude/skills",
};

const name = z
  .string()
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)
  .max(64);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
// Portable paths: reject traversal, hidden segments, Windows aliases and reserved names.
const filePath = z
  .string()
  .max(240)
  .refine((value) => {
    return value
      .split("/")
      .every(
        (part) =>
          /^(?:[a-zA-Z0-9_][a-zA-Z0-9_.-]*|\.[a-zA-Z0-9_][a-zA-Z0-9_.-]*)$/.test(
            part,
          ) &&
          !part.endsWith(".") &&
          !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
      );
  }, "文件路径必须是安全的相对路径");

export const fileRecordSchema = z.strictObject({
  path: filePath,
  sha256: digest,
});
const projectFilesSchema = z
  .array(fileRecordSchema)
  .min(1)
  .max(100)
  .superRefine((files, ctx) => {
    const seen = new Set<string>();
    for (const file of files) {
      const path = file.path.toLowerCase();
      if (
        seen.has(path) ||
        files.some((other) => other.path.toLowerCase().startsWith(`${path}/`))
      ) {
        ctx.addIssue({
          code: "custom",
          message: `重复或冲突路径：${file.path}`,
        });
      }
      seen.add(path);
    }
  });
const filesSchema = projectFilesSchema.refine(
  (files) => files.some((file) => file.path === "SKILL.md"),
  "缺少 SKILL.md",
);
const version = z.string().regex(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/);

export const assetTypeSchema = z.enum(["ui", "preset", "template"]);
const assetSchema = z.strictObject({
  type: assetTypeSchema,
  name,
  description: z.string().min(1).max(1024),
  files: z
    .array(fileRecordSchema.extend({ content: z.string().max(256_000) }))
    .min(1)
    .max(100),
  requires: z
    .array(z.string().regex(/^(ui|preset)\/[a-z][a-z0-9-]*$/))
    .default([]),
  dependencies: z.record(z.string(), z.string()).default({}),
});

export const registrySchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    version,
    skills: z
      .array(
        z.strictObject({
          name,
          description: z.string().min(1).max(1024),
          files: z
            .array(
              fileRecordSchema.extend({ content: z.string().max(256_000) }),
            )
            .min(1)
            .max(100),
        }),
      )
      .min(1)
      .max(100),
    assets: z.array(assetSchema).max(100).default([]),
  })
  .superRefine((registry, ctx) => {
    const names = new Set<string>();
    for (const skill of registry.skills) {
      if (names.has(skill.name))
        ctx.addIssue({ code: "custom", message: `重复 Skill：${skill.name}` });
      names.add(skill.name);
      const paths = filesSchema.safeParse(
        skill.files.map(({ path, sha256 }) => ({ path, sha256 })),
      );
      if (!paths.success)
        ctx.addIssue({
          code: "custom",
          message: `${skill.name}: ${paths.error.message}`,
        });
      for (const file of skill.files) {
        if (sha256(file.content) !== file.sha256)
          ctx.addIssue({
            code: "custom",
            message: `摘要不匹配：${skill.name}/${file.path}`,
          });
      }
    }
    const assetNames = new Set<string>();
    for (const asset of registry.assets) {
      const key = `${asset.type}/${asset.name}`;
      if (assetNames.has(key))
        ctx.addIssue({ code: "custom", message: `重复资产：${key}` });
      assetNames.add(key);
      const files = projectFilesSchema.safeParse(
        asset.files.map(({ path, sha256 }) => ({ path, sha256 })),
      );
      if (!files.success)
        ctx.addIssue({
          code: "custom",
          message: `${key}: ${files.error.message}`,
        });
      for (const file of asset.files) {
        if (sha256(file.content) !== file.sha256)
          ctx.addIssue({
            code: "custom",
            message: `摘要不匹配：${key}/${file.path}`,
          });
        if (
          /^(?:\.git|\.agent-base|node_modules|\.agents|\.claude)(?:\/|$)/i.test(
            file.path,
          )
        )
          ctx.addIssue({ code: "custom", message: `保留路径：${file.path}` });
      }
    }
    for (const asset of registry.assets)
      for (const required of asset.requires) {
        if (!assetNames.has(required))
          ctx.addIssue({
            code: "custom",
            message: `缺少资产依赖：${required}`,
          });
      }
  });

export const installationSchema = z.strictObject({
  name,
  agent: agentSchema,
  version,
  source: z.string().min(1),
  sourceSha256: digest,
  files: filesSchema,
});
export const projectAssetSchema = z.strictObject({
  type: assetTypeSchema,
  name,
  version,
  source: z.string().min(1),
  sourceSha256: digest,
  files: projectFilesSchema,
});
export const manifestSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    installations: z.array(installationSchema),
    assets: z.array(projectAssetSchema).default([]),
  })
  .superRefine((manifest, ctx) => {
    const keys = manifest.installations.map(
      (item) => `${item.agent}/${item.name}`,
    );
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({ code: "custom", message: "安装记录重复" });
    const assets = manifest.assets.map((item) => `${item.type}/${item.name}`);
    if (new Set(assets).size !== assets.length)
      ctx.addIssue({ code: "custom", message: "资产记录重复" });
  });

export type Registry = z.infer<typeof registrySchema>;
export type Skill = Registry["skills"][number];
export type Manifest = z.infer<typeof manifestSchema>;
export type Installation = z.infer<typeof installationSchema>;
export type Asset = Registry["assets"][number];
export type ProjectAsset = z.infer<typeof projectAssetSchema>;
export type AssetType = z.infer<typeof assetTypeSchema>;

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function parseData<T>(
  schema: z.ZodType<T>,
  input: unknown,
  label: string,
): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new AppError(
      "INVALID_DATA",
      `${label}不合法：${result.error.message}`,
      2,
    );
  return result.data;
}

export function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError("INVALID_JSON", `${label}不是有效 JSON`, 2);
  }
}
