import { Router } from "express";
import { Prisma, type PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { z } from "zod";
import { ProductionError } from "./production-rules.js";

const fields = z.object({ login: z.string().trim().min(1).max(100), firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100), active: z.boolean(), workCenterIds: z.array(z.string().uuid()).max(100), role: z.enum(["EMPLOYEE", "PLANNER", "DIRECTOR"]).default("EMPLOYEE"), password: z.string().min(10).max(256).optional() }).strict();
const select = { id: true, login: true, firstName: true, lastName: true, role: true, active: true, workCenters: { select: { workCenter: { select: { id: true, name: true } } } } };
// Учётные записи всех ролей. Участки есть только у сотрудника; планер и директор видят всё производство.
// Себе роль не меняют и доступ не отключают, последний действующий планер остаётся планером — иначе в систему некому будет войти.
export function staffRouter(prisma: PrismaClient) {
  const router = Router();
  router.get("/", async (_req, res) => { res.json(await prisma.user.findMany({ select, orderBy: [{ role: "asc" }, { lastName: "asc" }, { firstName: "asc" }] })); });
  async function save(input: z.infer<typeof fields>, actorId: string, id?: string) {
    const employee = input.role === "EMPLOYEE", ids = employee ? [...new Set(input.workCenterIds)] : [];
    const passwordHash = input.password ? await argon2.hash(input.password) : undefined;
    return prisma.$transaction(async tx => {
      if (await tx.workCenter.count({ where: { id: { in: ids }, active: true } }) !== ids.length) throw new ProductionError(400, "Выберите действующие участки");
      if (employee && input.active && !ids.length) throw new ProductionError(400, "Назначьте сотруднику хотя бы один участок");
      const before = id ? await tx.user.findUnique({ where: { id }, select }) : null;
      if (id && !before) throw new ProductionError(404, "Сотрудник не найден");
      if (id === actorId && (input.role !== before!.role || !input.active)) throw new ProductionError(400, "Свою роль и доступ изменить нельзя — попросите другого планера");
      if (before?.role === "PLANNER" && before.active && (input.role !== "PLANNER" || !input.active) && await tx.user.count({ where: { role: "PLANNER", active: true, id: { not: id } } }) === 0) throw new ProductionError(400, "Это единственный действующий планер — сначала заведите второго");
      const data = { login: input.login, firstName: input.firstName, lastName: input.lastName, active: input.active, role: input.role };
      const user = id ? await tx.user.update({ where: { id }, data: { ...data, ...(passwordHash ? { passwordHash } : {}), workCenters: { deleteMany: {}, create: ids.map(workCenterId => ({ workCenterId })) } }, select }) : await tx.user.create({ data: { ...data, passwordHash: passwordHash!, workCenters: { create: ids.map(workCenterId => ({ workCenterId })) } }, select });
      await tx.auditLog.create({ data: { actorId, entityType: "User", entityId: user.id, action: id ? "USER_UPDATED" : "USER_CREATED", before: before ?? Prisma.JsonNull, after: { ...user, passwordChanged: Boolean(passwordHash) } } });
      return user;
    }, { isolationLevel: "Serializable" });
  }
  router.post("/", async (req, res) => { const data = fields.extend({ password: z.string().min(10).max(256) }).parse(req.body); res.status(201).json(await save(data, req.session!.sub)); });
  router.put("/:id", async (req, res) => { res.json(await save(fields.parse(req.body), req.session!.sub, z.string().uuid().parse(req.params.id))); });
  return router;
}
