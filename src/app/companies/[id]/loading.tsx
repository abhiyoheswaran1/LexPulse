export default function CompanyLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-4 w-20 rounded bg-panel2" />
      <div className="rounded-xl border border-border bg-panel/60 p-7">
        <div className="h-3 w-24 rounded bg-panel2" />
        <div className="mt-4 h-10 max-w-xl rounded bg-panel2" />
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-16 rounded-lg bg-panel2" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="h-72 rounded-xl border border-border bg-panel/60" />
        <div className="h-72 rounded-xl border border-border bg-panel/60" />
      </div>
    </div>
  );
}
