import "server-only";

/** Keep server settings runtime-bound: Turbopack also inlines aliased NEXT_PUBLIC member access. */
export function serverEnvironment(name: string): string | undefined {
  const value: unknown = Reflect.get(process.env, name);
  return typeof value === "string" ? value : undefined;
}
