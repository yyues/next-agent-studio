"use client";

import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

// Lightweight select built on native <select> styled to match the design system.
// Use SelectTrigger/SelectContent/SelectItem API surface for drop-in compat with
// role-switcher; renders a plain <select> under the hood.

export type SelectProps = ComponentPropsWithoutRef<"select"> & {
  value?: string;
  onValueChange?: (value: string) => void;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, value, onValueChange, ...props }, ref) => {
    return (
      <select
        ref={ref}
        value={value}
        onChange={(e) => onValueChange?.(e.target.value)}
        className={cn(
          "bg-background border-input text-foreground h-9 rounded-md border px-2.5 text-sm outline-none",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  },
);
Select.displayName = "Select";

export const SelectTrigger = forwardRef<
  HTMLSelectElement,
  SelectProps & { asChild?: boolean }
>(({ className, children, ...props }, ref) => {
  // In a native-select world SelectTrigger just wraps Select.
  return (
    <Select ref={ref} className={className} {...props}>
      {children}
    </Select>
  );
});
SelectTrigger.displayName = "SelectTrigger";

export const SelectValue = ({
  children,
  placeholder,
}: {
  children?: React.ReactNode;
  placeholder?: string;
}) => {
  // With a native <select> the selected option text is shown automatically.
  // This component exists for API compat; it renders nothing.
  if (children) return <>{children}</>;
  return <option value="" disabled>{placeholder}</option>;
};
SelectValue.displayName = "SelectValue";

export const SelectContent = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  // Native <select> doesn't have separate content; options are direct children.
  return <>{children}</>;
};
SelectContent.displayName = "SelectContent";

export const SelectItem = forwardRef<
  HTMLOptionElement,
  ComponentPropsWithoutRef<"option"> & { value: string }
>(({ className, children, ...props }, ref) => {
  return (
    <option ref={ref} className={className} {...props}>
      {children}
    </option>
  );
});
SelectItem.displayName = "SelectItem";
