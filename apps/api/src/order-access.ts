import type { Prisma, PrismaClient, UserRole } from "@prisma/client";
import { seesEverything } from "./access.js";

// Какие заказы видит человек: Планер и директор — все, сотрудник — заказы, где есть задачи его участков.
export async function orderAccessWhere(prisma: PrismaClient, session: { sub: string; role: UserRole }): Promise<Prisma.OrderWhereInput> {
  if (seesEverything(session.role)) return {};
  const links = await prisma.userWorkCenter.findMany({ where: { userId: session.sub }, select: { workCenterId: true } });
  return { launches: { some: { items: { some: { operations: { some: { workCenterId: { in: links.map(link => link.workCenterId) } } } } } } } };
}
