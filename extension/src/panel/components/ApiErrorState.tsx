import { ArrowsClockwiseIcon, PlugsIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { API_URL, ApiError } from "../lib/api";
import { Button } from "./ui";

export function ApiErrorState({
    error,
    retrying,
    onRetry,
}: {
    error: Error;
    retrying: boolean;
    onRetry: () => void;
}) {
    const offline = error instanceof ApiError && error.offline;

    return (
        <div className="flex h-full flex-col justify-center px-6 py-8">
            <span className="grid size-12 place-items-center rounded-card bg-danger-soft text-danger">
                {offline ? <PlugsIcon size={24} /> : <WarningCircleIcon size={24} />}
            </span>
            <h2 className="mt-4 text-[16px] font-semibold">
                {offline ? "Não encontramos o backend" : "A API respondeu com erro"}
            </h2>
            <p className="mt-1 max-w-[36ch] text-[13px] leading-relaxed text-ink-3">
                {offline
                    ? `A extensão procura a API da EunomIA em ${API_URL}. Inicie o servidor e tente de novo.`
                    : error.message}
            </p>
            {offline && (
                <code className="mt-4 block rounded-control bg-sunken px-3 py-2.5 font-mono text-[12px] text-ink-2">
                    cd backend && uvicorn app.main:app --port 8000
                </code>
            )}
            <Button
                variant="primary"
                className="mt-5 self-start"
                onClick={onRetry}
                disabled={retrying}
            >
                <ArrowsClockwiseIcon
                    size={16}
                    className={retrying ? "motion-safe:animate-spin" : undefined}
                />
                {retrying ? "Tentando..." : "Tentar novamente"}
            </Button>
        </div>
    );
}
