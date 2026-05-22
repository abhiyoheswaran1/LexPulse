export type ThreadableAlert = {
  id: string;
  type: string;
  createdAt: string;
  company: {
    id: string;
  };
};

export type AlertThread<T extends ThreadableAlert> = {
  key: string;
  primary: T;
  alerts: T[];
};

export function groupAlertThreads<T extends ThreadableAlert>(alerts: T[]): AlertThread<T>[] {
  const byKey = new Map<string, T[]>();
  for (const alert of alerts) {
    const key = alertThreadKey(alert);
    const thread = byKey.get(key) ?? [];
    thread.push(alert);
    byKey.set(key, thread);
  }

  return [...byKey.entries()]
    .map(([key, thread]) => {
      const alerts = [...thread].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return { key, primary: alerts[0], alerts };
    })
    .sort((a, b) => new Date(b.primary.createdAt).getTime() - new Date(a.primary.createdAt).getTime());
}

function alertThreadKey(alert: ThreadableAlert) {
  return `${alert.company.id}:${alert.type}`;
}
