export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="panel border-dashed text-center">
      <p className="font-bold">{title}</p>
      <p className="mx-auto mt-1 max-w-72 text-sm leading-6 text-zinc-500 dark:text-zinc-400">{text}</p>
    </div>
  );
}
