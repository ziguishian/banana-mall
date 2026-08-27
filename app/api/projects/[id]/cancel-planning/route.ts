import { prisma } from "@/lib/db/prisma";
import { cancelTask } from "@/lib/services/task-service";
import { handleRouteError, ok } from "@/lib/utils/route";

async function findActivePlanningTask(projectId: string) {
  return prisma.generationTask.findFirst({
    where: {
      projectId,
      sectionId: null,
      taskType: "PLAN",
      status: { in: ["PENDING", "RUNNING"] },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function POST(_request: Request, context: { params: { id: string } }) {
  try {
    let task = await findActivePlanningTask(context.params.id);

    // The stop action can arrive while the planning request is still creating its task record.
    for (let attempt = 0; !task && attempt < 10; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      task = await findActivePlanningTask(context.params.id);
    }

    if (!task) {
      return ok({ taskId: null, canceled: false });
    }

    const canceledTask = await cancelTask(task.id);
    return ok({
      taskId: canceledTask.id,
      canceled: canceledTask.status === "CANCELED",
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
