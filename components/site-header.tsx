import { Wordmark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader({ aside }: { aside?: React.ReactNode }) {
  return (
    <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
      <Wordmark />
      <div className="flex items-center gap-3 text-sm">
        {aside}
        <ThemeToggle />
      </div>
    </header>
  );
}
