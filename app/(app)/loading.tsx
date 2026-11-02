export default function Loading() {
  const bar = "rounded-[8px] bg-raised motion-safe:animate-pulse";
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className={`${bar} h-7 w-48`} />
      <div className={`${bar} mt-3 h-4 w-80 max-w-full`} />
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-card border border-border bg-card p-6">
          <div className={`${bar} h-4 w-40`} />
          <div className={`${bar} mt-3 h-9 w-56`} />
          <div className="mt-6 grid gap-2 sm:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className={`${bar} h-20`} />)}</div>
        </div>
        <div className="rounded-card border border-border bg-card p-6"><div className={`${bar} h-4 w-32`} /><div className={`${bar} mt-4 h-2 w-full`} /></div>
      </div>
    </div>
  );
}
