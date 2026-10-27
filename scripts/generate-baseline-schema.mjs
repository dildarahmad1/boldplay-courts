import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/integrations/supabase/types.ts", import.meta.url), "utf8");
const tablesSource = source.split("    Tables: {")[1].split("    Views: {")[0];
const enumSource = source.split("    Enums: {")[1].split("    CompositeTypes:")[0];

const enumNames = [...enumSource.matchAll(/^      ([a-z_]+):/gm)].map((match) => match[1]);
const tableMatches = [...tablesSource.matchAll(/^      ([a-z_]+): \{\n        Row: \{([\s\S]*?)\n        \}\n        Insert:/gm)];

const sqlType = (name, type) => {
  const clean = type.replace(/ \| null/g, "").trim();
  const enumMatch = clean.match(/Enums"\]\["([a-z_]+)"\]/);
  if (enumMatch) return `public.${enumMatch[1]}`;
  if (clean === "Json") return "jsonb";
  if (clean === "boolean") return "boolean";
  if (clean === "number") return "numeric";
  if (clean === "string[]") return "text[]";
  if (name === "id" || name.endsWith("_id")) return "uuid";
  if (name.endsWith("_at")) return "timestamptz";
  if (name.endsWith("_date") || name === "date" || name === "start_date" || name === "end_date") return "date";
  if (name === "start_time" || name === "end_time" || name === "opening_time" || name === "closing_time") return "time";
  return "text";
};

const defaultFor = (name, type, nullable) => {
  if (name === "id") return " default gen_random_uuid()";
  if (name === "created_at" || name === "updated_at") return " default now()";
  if (!nullable && type === "boolean") return " default false";
  return "";
};

const enumValues = {
  app_role: ["admin", "host", "guest"],
  booking_status: ["pending_payment", "confirmed", "cancelled_guest", "cancelled_host", "completed", "expired"],
  cancellation_policy: ["flexible", "moderate", "strict"],
  court_type: ["football", "padel", "basketball", "tennis", "volleyball", "multi_use", "other"],
  dispute_category: ["refund_request", "policy_violation", "property_damage", "cleanliness_issue", "amenity_issue", "safety_concern", "billing_dispute", "other"],
  dispute_status: ["open", "in_progress", "resolved", "closed", "escalated", "pending", "on_hold", "resolved_approved", "resolved_declined"],
  listing_status: ["draft", "pending", "approved", "rejected", "blocked"],
  payout_status_enum: ["pending", "completed", "failed", "cancelled"],
  property_type: ["court", "field", "arena", "sports_complex", "venue"],
  review_status: ["pending", "approved", "rejected", "blocked"],
  surface_type: ["grass", "artificial_turf", "hardwood", "concrete", "clay", "sand", "rubber", "other"],
  thread_type: ["user_to_user", "user_to_support"],
  user_status: ["active", "inactive", "suspended"],
};

let output = "create extension if not exists pgcrypto;\n\n";
for (const name of enumNames) {
  const values = enumValues[name];
  if (values) output += `create type public.${name} as enum (${values.map((v) => `'${v}'`).join(", ")});\n`;
}

for (const [, tableName, rowBody] of tableMatches) {
  const columns = [...rowBody.matchAll(/^          ([a-z_]+): (.+)$/gm)].map(([, name, rawType]) => {
    const nullable = rawType.includes("| null");
    const type = sqlType(name, rawType);
    const primary = name === "id" ? " primary key" : "";
    return `  ${name} ${type}${primary}${defaultFor(name, type, nullable)}${nullable || name === "id" ? "" : " not null"}`;
  });
  output += `\ncreate table public.${tableName} (\n${columns.join(",\n")}\n);\n`;
}

for (const [, tableName] of tableMatches) {
  output += `alter table public.${tableName} enable row level security;\n`;
}

fs.writeFileSync(new URL("../supabase/baseline.generated.sql", import.meta.url), output);
