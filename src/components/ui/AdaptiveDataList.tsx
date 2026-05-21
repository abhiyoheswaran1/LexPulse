import { cn } from "@/lib/utils";

export function AdaptiveDataList({
  mobile,
  table,
  className,
}: {
  mobile: React.ReactNode;
  table: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="space-y-3 sm:hidden">{mobile}</div>
      <div className={cn("-mx-5 -mb-5 hidden overflow-x-auto sm:block")}>{table}</div>
    </div>
  );
}
