export default function AlertsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="border-b border-border pb-6">
        <div className="h-3 w-28 rounded bg-panel2" />
        <div className="mt-4 h-8 w-36 rounded bg-panel2" />
        <div className="mt-4 h-4 max-w-2xl rounded bg-panel2" />
      </div>
      <div className="rounded-xl border border-border bg-panel/60 p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-14 rounded-md bg-panel2" />
          ))}
        </div>
        <div className="mt-6 space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-20 rounded-lg bg-panel2" />
          ))}
        </div>
      </div>
    </div>
  );
}
