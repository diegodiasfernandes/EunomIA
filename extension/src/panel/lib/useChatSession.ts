import { useState } from "react";
import { useChat } from "./queries";
import type { ApprovalItem } from "./types";

export type DraftState = "open" | "added" | "dismissed";

export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    text: string;
    failed?: boolean;
    draft?: ApprovalItem;
    draftState?: DraftState;
}

export function useChatSession() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const chat = useChat();

    const append = (message: Omit<ChatMessage, "id">) =>
        setMessages((current) => [...current, { ...message, id: crypto.randomUUID() }]);

    function send(text: string) {
        append({ role: "user", text });
        chat.mutate(text, {
            onSuccess: (response) => {
                if (response.action !== "record_confirmation_required") {
                    append({ role: "assistant", text: response.reply });
                    return;
                }
                const draft: ApprovalItem =
                    response.record_type === "meeting"
                        ? { kind: "meeting", record: response.record }
                        : { kind: "deadline", record: response.record };
                append({ role: "assistant", text: response.reply, draft, draftState: "open" });
            },
            onError: (error) => append({ role: "assistant", text: error.message, failed: true }),
        });
    }

    const setDraftState = (id: string, draftState: DraftState) =>
        setMessages((current) =>
            current.map((message) => (message.id === id ? { ...message, draftState } : message)),
        );

    return { messages, send, thinking: chat.isPending, setDraftState };
}
