import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export function useSpringValue(target: number) {
  const [value, setValue] = useState(target);
  const current = useRef(target), velocity = useRef(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      current.current = target; velocity.current = 0; setValue(target); return;
    }
    let frame = 0, previous = 0;
    const step = (time: number) => {
      const dt = previous ? Math.min((time - previous) / 1000, .024) : 1 / 60;
      previous = time;
      velocity.current += (230 * (target - current.current) - 21 * velocity.current) * dt;
      current.current += velocity.current * dt;
      if (Math.abs(target - current.current) < .08 && Math.abs(velocity.current) < .1) {
        current.current = target; velocity.current = 0; setValue(target);
      } else { setValue(current.current); frame = requestAnimationFrame(step); }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return value;
}

export function AnimatedDisclosure({ open, children, className = 'task-detail' }: { open: boolean; children: ReactNode; className?: string }) {
  const inner = useRef<HTMLDivElement>(null);
  const [naturalHeight, setNaturalHeight] = useState(0);
  useLayoutEffect(() => {
    const element = inner.current!;
    const observer = new ResizeObserver(() => setNaturalHeight(element.getBoundingClientRect().height));
    setNaturalHeight(element.getBoundingClientRect().height);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const height = useSpringValue(open ? naturalHeight : 0);
  return <div className="task-disclosure" style={{ height: Math.max(0, height), opacity: Math.min(1, height / Math.max(1, naturalHeight) * 1.6) }} inert={!open} aria-hidden={!open}>
    <div ref={inner} className={className}>{children}</div>
  </div>;
}
