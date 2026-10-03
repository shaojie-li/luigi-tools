import { Button as Primitive } from "@base-ui/react/button";
import type { ComponentProps } from "react";

export function Button({
  className = "",
  ...props
}: ComponentProps<typeof Primitive>) {
  return (
    <Primitive
      className={`inline-flex items-center justify-center rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      {...props}
    />
  );
}
