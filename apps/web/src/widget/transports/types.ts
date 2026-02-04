export type ChatSendInput = {
  cityId: string;
  apiBaseUrl?: string;
  message: string;
  signal?: AbortSignal;
  conversationId?: string;
  messageId?: string;
  onAction?: (action: { type: string; data?: any }) => void;
  onMeta?: (meta: Record<string, any>) => void;
};

export interface ChatTransport {
  sendMessage(input: ChatSendInput): AsyncGenerator<string, void, unknown>;
}
