import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-progress disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[#f7f7f5] text-[#141413] hover:bg-[#ff5c2a]",
        secondary: "border-white/15 bg-transparent text-inherit hover:border-[#ff5c2a]",
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
