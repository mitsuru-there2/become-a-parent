import type { ButtonHTMLAttributes } from "react";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";
interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" | null;
  size?: "default" | "sm" | "lg" | "icon" | null;
}
export function Button({
  asChild,
  variant = "default",
  size = "default",
  className,
  ...props
}: Props) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      type={asChild ? undefined : "button"}
      className={cn("base-button", `button-${variant}`, `size-${size}`, className)}
      {...props}
    />
  );
}
