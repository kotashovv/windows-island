import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Task } from './bridge';

// Persist completed rows long enough to acknowledge success before removing them.
// The transition is driven by state changes, so MCP completions use it too.
export function useAnimatedTasks(tasks: Task[]) {
  const previous = useRef<Task[]>([]);
  const [leaving, setLeaving] = useState<Record<string, { task: Task; height: number; wasRunning: boolean }>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useLayoutEffect(() => {
    const additions: typeof leaving = {};
    for (const task of tasks) {
      const old = previous.current.find(item => item.id === task.id);
      if (task.status === 'done' && old && old.status !== 'done') {
        const height = document.getElementById(`task-${task.id}`)?.getBoundingClientRect().height || 59;
        additions[task.id] = { task, height, wasRunning: old.status === 'running' };
        clearTimeout(timers.current.get(task.id));
        timers.current.set(task.id, setTimeout(() => {
          setLeaving(value => { const next = { ...value }; delete next[task.id]; return next; });
          timers.current.delete(task.id);
        }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 780));
      }
    }
    setLeaving(value => {
      const next = { ...value, ...additions };
      for (const id of Object.keys(next)) {
        if (!tasks.some(task => task.id === id && task.status === 'done')) {
          delete next[id]; clearTimeout(timers.current.get(id)); timers.current.delete(id);
        }
      }
      return next;
    });
    previous.current = tasks;
  }, [tasks]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);
  return leaving;
}
