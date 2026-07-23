export function PageHeader(props: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0 space-y-2">
        {props.eyebrow ? (
          <p className="text-xs font-medium uppercase tracking-[0.26em] text-slate-500 dark:text-slate-400">{props.eyebrow}</p>
        ) : null}
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-slate-950 dark:text-white">{props.title}</h1>
          <p className="max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">{props.description}</p>
        </div>
      </div>
      {props.actions ? <div className="flex flex-wrap items-center gap-3 md:shrink-0 md:justify-end">{props.actions}</div> : null}
    </div>
  );
}
