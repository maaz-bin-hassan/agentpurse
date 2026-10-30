import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader({ aside }: { aside?: React.ReactNode }) {
  return (
    <header className="topbar">
      <Link className="wordmark" href="/">
        Agent<span>Purse</span>
      </Link>
      <div className="flex items-center gap-3">
        {aside}
        <ThemeToggle />
      </div>
    </header>
  );
}
