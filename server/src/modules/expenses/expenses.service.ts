import { prisma, Prisma } from "../../services/prisma";
import { NotFoundError } from "../../utils/errors";
import type { CreateExpenseInput } from "./expenses.schema";

export const expensesService = {
  async list({
    page = 1,
    limit = 100000,
    search,
    dateFrom,
    dateTo,
    includeArchived = false,
    archivedOnly = false,
    sortBy,
    sortOrder,
  }: {
    page?: number;
    limit?: number;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    includeArchived?: boolean;
    archivedOnly?: boolean;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  } = {}) {
    const where: Prisma.ExpenseWhereInput = archivedOnly
      ? { active: 0 }
      : includeArchived
      ? {}
      : { active: 1 };

    if (search) {
      const q = search.trim();
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
      ];
    }

    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) {
        where.date.gte = dateFrom;
      }
      if (dateTo) {
        where.date.lte = dateTo;
      }
    }

    const skip = (page - 1) * limit;

    let orderBy: Prisma.ExpenseOrderByWithRelationInput = { createdAt: sortOrder || "desc" };
    if (sortBy === "title") {
      orderBy = { title: sortOrder || "asc" };
    } else if (sortBy === "category") {
      orderBy = { category: sortOrder || "asc" };
    } else if (sortBy === "amount") {
      orderBy = { amount: sortOrder || "desc" };
    } else if (sortBy === "date") {
      orderBy = { date: sortOrder || "desc" };
    } else if (sortBy === "createdAt" || sortBy === "created_at") {
      orderBy = { createdAt: sortOrder || "desc" };
    }

    const [total, data] = await prisma.$transaction([
      prisma.expense.count({ where }),
      prisma.expense.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async create(data: CreateExpenseInput) {
    return prisma.expense.create({
      data: {
        title: data.title,
        category: data.category,
        amount: data.amount,
        notes: data.notes ?? "",
        date: data.date,
      },
    });
  },

  async update(id: string, data: CreateExpenseInput) {
    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Expense");
    return prisma.expense.update({
      where: { id },
      data: {
        title: data.title,
        category: data.category,
        amount: data.amount,
        notes: data.notes ?? "",
        date: data.date,
      },
    });
  },

  async delete(id: string) {
    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Expense");
    return prisma.expense.update({
      where: { id },
      data: { active: 0 },
    });
  },

  async restore(id: string) {
    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Expense");
    return prisma.expense.update({
      where: { id },
      data: { active: 1 },
    });
  },

  async hardDelete(id: string) {
    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Expense");
    await prisma.expense.delete({ where: { id } });
    return { success: true };
  },
};
