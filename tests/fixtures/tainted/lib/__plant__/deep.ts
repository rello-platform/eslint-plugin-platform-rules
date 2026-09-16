import { prisma } from "@/lib/db";
export function deepProbe() { return Boolean(prisma); }
