export const getOrganizationTaskMetrics = (tasks, now = new Date()) => {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const counts = { todo: 0, in_progress: 0, review: 0, done: 0 };
  let overdue = 0;

  for (const task of tasks) {
    if (Object.hasOwn(counts, task.status)) counts[task.status] += 1;
    if (task.status !== 'done' && task.due_date) {
      const due = new Date(`${task.due_date}T00:00:00`);
      if (!Number.isNaN(due.valueOf()) && due < today) overdue += 1;
    }
  }

  const total = tasks.length;
  return {
    total,
    counts,
    overdue,
    completionRate: total ? Math.round((counts.done / total) * 100) : 0
  };
};