const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface SSEEvent {
  section?: string;
  step: string;
  message: string;
  [key: string]: unknown;
}

export async function streamSSE(
  path: string,
  body: unknown,
  onEvent: (event: SSEEvent) => void,
): Promise<void> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("fi_token") : null;

  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const reader = res.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          onEvent(data);
        } catch {}
      }
    }
  }
}
