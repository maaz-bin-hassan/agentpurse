import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-progress disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "border-ink bg-ink text-paper hover:border-brass-deep hover:bg-brass-deep hover:text-white",
        secondary: "border-ink bg-transparent text-ink hover:border-brass",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Button({
  className,
  variant,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant }), className)} {...props} />;
}
