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

  const attemptFetch = async (retryCount: number): Promise<T> => {
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
        if (retryCount < 2) {
          await new Promise((resolve) => setTimeout(resolve, retryCount === 0 ? 1500 : 2500));
          return attemptFetch(retryCount + 1);
        }
        if (response.status === 504 || response.status === 502 || response.status === 408) {
          throw new Error(
            "Server band yoki vaqtincha javob bermadi. Bir necha soniyadan so'ng qayta urinib ko'ring.",
          );
        }
        if (response.status === 404) {
          throw new Error(
            "API server topilmadi (HTTP 404). Agar tashqi serverga qo'ygan bo'lsangiz, faqat static fayllarni emas, 'npm run build && npm start' (node server.ts) ni ishga tushiring; AI Studio'da esa ilovani qayta Share qilib ko'ring.",
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
        if (response.status === 404 && !trimmed && retryCount < 1) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
          return attemptFetch(retryCount + 1);
        }
        const errorMsg =
          parsed && typeof parsed.error === 'string'
            ? parsed.error
            : response.status === 404
            ? "API server topilmadi (HTTP 404). Agar tashqi serverga qo'ygan bo'lsangiz, 'npm run build && npm start' (node server.ts) ni ishga tushiring; AI Studio'da esa ilovani qayta Share qiling."
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

  return attemptFetch(0);
}
