export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="border-b border-border pb-6">
        <div className="h-3 w-44 rounded bg-panel2" />
        <div className="mt-4 h-8 w-72 rounded bg-panel2" />
        <div className="mt-4 h-4 max-w-2xl rounded bg-panel2" />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="h-80 rounded-xl border border-border bg-panel/50" />
        <div className="h-80 rounded-xl border border-border bg-panel/50" />
      </div>
    </div>
  );
}
