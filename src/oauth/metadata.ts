export function publicBase(env: NodeJS.ProcessEnv = process.env): string {
  return (env.PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}
