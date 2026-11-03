import type { ComponentProps, ReactNode } from "react";
import { initials, type Person } from "../lib/format";

export const cn = (...classes: (string | false | null | undefined)[]) =>
    classes.filter(Boolean).join(" ");

type ButtonVariant = "primary" | "secondary" | "ghost";

const buttonVariants: Record<ButtonVariant, string> = {
    primary:
        "bg-accent text-on-accent hover:bg-accent-hover shadow-[inset_0_1px_0_rgb(255_255_255/0.14)]",
    secondary: "bg-surface text-ink border border-line-strong hover:bg-sunken",
    ghost: "text-ink-2 hover:bg-sunken hover:text-ink",
};

export function Button({
    variant = "secondary",
    className,
    children,
    ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
    return (
        <button
            type="button"
            className={cn(
                "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-control px-3.5 text-[13px] font-medium",
                "transition-[background-color,color,transform] duration-150 active:translate-y-px",
                "disabled:pointer-events-none disabled:opacity-55",
                buttonVariants[variant],
                className,
            )}
            {...props}
        >
            {children}
        </button>
    );
}

export function IconButton({
    label,
    className,
    children,
    ...props
}: ComponentProps<"button"> & { label: string }) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            className={cn(
                "grid size-9 shrink-0 place-items-center rounded-control text-ink-2 transition-colors duration-150",
                "hover:bg-sunken hover:text-ink active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
                className,
            )}
            {...props}
        >
            {children}
        </button>
    );
}

export type Tone = "accent" | "warn" | "ok" | "danger" | "muted";

const toneClasses: Record<Tone, string> = {
    accent: "bg-accent-soft text-accent-ink",
    warn: "bg-warn-soft text-warn",
    ok: "bg-ok-soft text-ok",
    danger: "bg-danger-soft text-danger",
    muted: "bg-sunken text-ink-2",
};

export function Pill({
    tone = "muted",
    children,
    className,
}: {
    tone?: Tone;
    children: ReactNode;
    className?: string;
}) {
    return (
        <span
            className={cn(
                "inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[11.5px] font-medium",
                toneClasses[tone],
                className,
            )}
        >
            {children}
        </span>
    );
}

export function Skeleton({ className }: { className?: string }) {
    return (
        <span
            aria-hidden
            className={cn("relative block overflow-hidden rounded-md bg-sunken", className)}
        >
            <span className="absolute inset-0 bg-linear-to-r from-transparent via-surface/60 to-transparent motion-safe:animate-shimmer" />
        </span>
    );
}

const avatarTints = [
    "bg-accent-soft text-accent-ink",
    "bg-ok-soft text-ok",
    "bg-warn-soft text-warn",
    "bg-sunken text-ink-2",
];

export function Avatars({ people, max = 4 }: { people: Person[]; max?: number }) {
    if (!people.length) return null;
    const shown = people.slice(0, max);
    const rest = people.length - shown.length;
    return (
        <span className="flex items-center -space-x-1.5">
            {shown.map((person, index) => (
                <span
                    key={person.email}
                    title={`${person.name} <${person.email}>`}
                    className={cn(
                        "grid size-7 place-items-center rounded-full text-[10.5px] font-semibold ring-2 ring-surface",
                        avatarTints[index % avatarTints.length],
                    )}
                >
                    {initials(person.name)}
                </span>
            ))}
            {rest > 0 && (
                <span className="grid size-7 place-items-center rounded-full bg-sunken text-[10.5px] font-semibold text-ink-2 ring-2 ring-surface">
                    +{rest}
                </span>
            )}
        </span>
    );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
    return (
        <div className="mb-2.5 flex items-baseline justify-between gap-3 px-1">
            <h2 className="text-[13px] font-semibold text-ink-2">{children}</h2>
            {aside}
        </div>
    );
}
