import "@fontsource-variable/geist";
import "./styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: { staleTime: 20_000, retry: 1 },
    },
});

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <MotionConfig reducedMotion="user">
                <App />
            </MotionConfig>
        </QueryClientProvider>
    </StrictMode>,
);
