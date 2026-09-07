// Bound the stream itself, including chunked requests and slow upstream bodies.
// No body content is attached to an error (OAuth bodies contain credentials).
export async function readBoundedText(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  timeoutMs = 12_000,
): Promise<string> {
  if (!body) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("BODY_TIMEOUT")), timeoutMs);
  });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) return text + decoder.decode();
      size += value.byteLength;
      if (size > maxBytes) throw new Error("BODY_TOO_LARGE");
      text += decoder.decode(value, { stream: true });
    }
  } catch (error) {
    // A broken peer must not be able to stall the error response in cancel().
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
