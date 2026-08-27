import { getTaskWithStaleRecovery } from "@/lib/services/task-service";
import { handleRouteError, ok } from "@/lib/utils/route";

export async function GET(_request: Request, context: { params: { taskId: string } }) {
  try {
    const task = await getTaskWithStaleRecovery(context.params.taskId);
    return ok(task);
  } catch (error) {
    return handleRouteError(error);
  }
}
