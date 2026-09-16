import { deepProbe } from "@/lib/__plant__/deep";
export function collectHealth() { return deepProbe() ? "healthy" : "degraded"; }
