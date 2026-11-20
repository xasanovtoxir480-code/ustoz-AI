export interface PostJsonOptions {
  timeoutMs?: number;
  timeoutMessage?: string;
}

export async function postJson<T>(
  url: string,
  body: unknown,
  options: PostJsonOptions = {},
): Promise<T> {
  const {
    timeoutMs = 45000,
    timeoutMessage = "Javob kutish vaqti tugadi. Iltimos, qayta urinib ko'ring.",
  } = options;

  const attemptFetch = async (retried: boolean): Promise<T> => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const rawText = await response.text();
      const trimmed = rawText.trim();

      if (trimmed.startsWith('<')) {
        if (!retried) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          return attemptFetch(true);
        }
        if (response.status === 504 || response.status === 502 || response.status === 408) {
          throw new Error(
            "Server band yoki vaqtincha javob bermadi. Bir necha soniyadan so'ng qayta urinib ko'ring.",
          );
        }
        throw new Error(
          `Server vaqtincha yangilanmoqda yoki aloqa uzildi (HTTP ${response.status}). Sahifani yangilab qayta urinib ko'ring.`,
        );
      }

      let parsed: Record<string, unknown> | null = null;
      if (trimmed) {
        try {
          parsed = JSON.parse(trimmed) as Record<string, unknown>;
        } catch {
          throw new Error(
            `Server javobini o'qib bo'lmadi (HTTP ${response.status}). Qayta urinib ko'ring.`,
          );
        }
      }

      if (!response.ok) {
        const errorMsg =
          parsed && typeof parsed.error === 'string'
            ? parsed.error
            : `So'rov xatolik bilan yakunlandi (HTTP ${response.status}).`;
        throw new Error(errorMsg);
      }

      if (!parsed) {
        throw new Error("Server bo'sh javob qaytardi.");
      }

      return parsed as unknown as T;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error(timeoutMessage);
      }
      throw err;
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  return attemptFetch(false);
}
