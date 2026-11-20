import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveServerPort(): number {
  const portArgIdx = process.argv.indexOf('--port');
  if (portArgIdx !== -1 && process.argv[portArgIdx + 1]) {
    const parsedArg = Number(process.argv[portArgIdx + 1]);
    if (Number.isFinite(parsedArg) && parsedArg > 0) return parsedArg;
  }
  if (
    process.env.NGINX_PORT &&
    process.env.PORT === process.env.NGINX_PORT &&
    process.env.DEFAULT_APP_PORT
  ) {
    const defaultAppPort = Number(process.env.DEFAULT_APP_PORT);
    if (Number.isFinite(defaultAppPort) && defaultAppPort > 0) return defaultAppPort;
  }
  const envPort = Number(process.env.PORT || process.env.DEFAULT_APP_PORT || 3000);
  return Number.isFinite(envPort) && envPort > 0 ? envPort : 3000;
}

const PORT = resolveServerPort();
const isProduction =
  process.env.NODE_ENV === 'production' || process.argv.includes('--prod');

interface OmniKeyState {
  cooldownUntil: number;
  invalidUntil: number;
  failCount: number;
}

const omniClientCache = new Map<string, GoogleGenAI>();
const omniKeyHealth = new Map<string, OmniKeyState>();
let omniRoundRobinCursor = 0;

function getConfiguredApiKeys(): string[] {
  const rawSources: Array<string | undefined> = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEYS,
    process.env.OMNIROUTE_API_KEYS,
    process.env.GEMINI_FALLBACK_API_KEY,
  ];

  for (let i = 1; i <= 10; i++) {
    rawSources.push(process.env[`GEMINI_API_KEY_${i}`]);
  }

  const seen = new Set<string>();
  const keys: string[] = [];

  for (const raw of rawSources) {
    if (!raw) continue;
    const parts = raw
      .split(/[\s,;]+/)
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);

    for (const key of parts) {
      if (
        key === 'MY_GEMINI_API_KEY' ||
        key === 'MY_BACKUP_GEMINI_API_KEY' ||
        key === 'KEY_1' ||
        key === 'KEY_2'
      ) {
        continue;
      }
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }

  return keys;
}

function getClientForKey(apiKey: string): GoogleGenAI {
  const cached = omniClientCache.get(apiKey);
  if (cached) return cached;
  const client = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
  omniClientCache.set(apiKey, client);
  return client;
}

function getSlotState(apiKey: string, model: string): OmniKeyState {
  const slotKey = `${apiKey}::${model}`;
  let state = omniKeyHealth.get(slotKey);
  if (!state) {
    state = { cooldownUntil: 0, invalidUntil: 0, failCount: 0 };
    omniKeyHealth.set(slotKey, state);
  }
  return state;
}

function getOrderedOmniKeys(model: string): string[] {
  const allKeys = getConfiguredApiKeys();
  if (allKeys.length <= 1) return allKeys;

  const now = Date.now();
  const rotated: string[] = [];
  const startIdx = omniRoundRobinCursor % allKeys.length;
  omniRoundRobinCursor = (omniRoundRobinCursor + 1) % allKeys.length;

  for (let offset = 0; offset < allKeys.length; offset++) {
    rotated.push(allKeys[(startIdx + offset) % allKeys.length]);
  }

  const healthy = rotated.filter((k) => {
    const s = getSlotState(k, model);
    return s.invalidUntil <= now && s.cooldownUntil <= now;
  });

  const coolingDown = rotated
    .filter((k) => {
      const s = getSlotState(k, model);
      return s.invalidUntil <= now && s.cooldownUntil > now;
    })
    .sort((a, b) => getSlotState(a, model).cooldownUntil - getSlotState(b, model).cooldownUntil);

  return healthy.length > 0 ? [...healthy, ...coolingDown] : coolingDown.length > 0 ? coolingDown : rotated;
}

function getOmniRouteStats() {
  const keys = getConfiguredApiKeys();
  const now = Date.now();
  const primaryModel = 'gemini-3.1-flash-lite';
  let healthyKeys = 0;
  let cooldownKeys = 0;
  let invalidKeys = 0;

  for (const key of keys) {
    const state = getSlotState(key, primaryModel);
    if (state.invalidUntil > now) {
      invalidKeys++;
    } else if (state.cooldownUntil > now) {
      cooldownKeys++;
    } else {
      healthyKeys++;
    }
  }

  return {
    totalKeys: keys.length,
    healthyKeys,
    cooldownKeys,
    invalidKeys,
  };
}

function isQuotaError(msg: string): boolean {
  return (
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('429') ||
    msg.includes('QUOTA') ||
    msg.includes('RATE_LIMIT')
  );
}

function getQuotaCooldownMs(msg: string): number {
  if (msg.includes('PerDay') || msg.includes('per day')) {
    return 15 * 60 * 1000;
  }
  const match = msg.match(/"retryDelay"\s*:\s*"(\d+)s"/);
  if (match) {
    const seconds = Number(match[1]);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, 15 * 60 * 1000);
    }
  }
  return 65 * 1000;
}

function isAuthError(msg: string): boolean {
  return (
    msg.includes('API_KEY_INVALID') ||
    msg.includes('PERMISSION_DENIED') ||
    msg.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') ||
    msg.includes('401') ||
    msg.includes('403')
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`TIMEOUT: ${label} ${timeoutMs}ms ichida javob bermadi`));
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

async function generateWithOmniRoute(
  params: {
    contents: unknown;
    systemInstruction: string;
    thinkingLevel: ThinkingLevel;
    responseSchema: Record<string, unknown>;
    timeoutMs?: number;
  },
) {
  const allKeys = getConfiguredApiKeys();
  if (allKeys.length === 0) {
    throw new Error('NO_API_KEYS');
  }

  const { timeoutMs = 20000 } = params;
  const modelsToTry: Array<{ model: string; useThinking: boolean; limitMs: number; pauseBeforeMs?: number }> = [
    { model: 'gemini-3.1-flash-lite', useThinking: false, limitMs: timeoutMs },
    { model: 'gemini-3.1-flash-lite', useThinking: false, limitMs: timeoutMs, pauseBeforeMs: 450 },
    { model: 'gemini-4-hydrogen', useThinking: true, limitMs: Math.min(timeoutMs, 10000) },
  ];

  let primaryError: unknown;
  let lastError: unknown;

  for (let passIdx = 0; passIdx < modelsToTry.length; passIdx++) {
    const candidate = modelsToTry[passIdx];
    const orderedKeys = getOrderedOmniKeys(candidate.model);
    const now = Date.now();
    const eligibleKeys = orderedKeys.filter((k) => {
      const s = getSlotState(k, candidate.model);
      if (s.invalidUntil > now) return false;
      // On fallback passes, skip keys/models already known to be in cooldown
      if (passIdx > 0 && s.cooldownUntil > now) return false;
      return true;
    });

    if (eligibleKeys.length === 0) {
      continue;
    }

    if (candidate.pauseBeforeMs) {
      await new Promise((resolve) => setTimeout(resolve, candidate.pauseBeforeMs));
    }

    for (let kIdx = 0; kIdx < eligibleKeys.length; kIdx++) {
      const apiKey = eligibleKeys[kIdx];
      const state = getSlotState(apiKey, candidate.model);
      const ai = getClientForKey(apiKey);

      try {
        const result = await withTimeout(
          ai.models.generateContent({
            model: candidate.model,
            contents: params.contents as Parameters<typeof ai.models.generateContent>[0]['contents'],
            config: {
              systemInstruction: params.systemInstruction,
              ...(candidate.useThinking
                ? { thinkingConfig: { thinkingLevel: params.thinkingLevel } }
                : {}),
              responseMimeType: 'application/json',
              responseSchema: params.responseSchema,
            },
          }),
          candidate.limitMs,
          candidate.model,
        );

        state.cooldownUntil = 0;
        state.failCount = 0;
        return result;
      } catch (error) {
        if (passIdx === 0 && !primaryError) {
          primaryError = error;
        }
        lastError = error;
        const msg = error instanceof Error ? error.message : String(error);
        const shortMsg = msg.slice(0, 160).replace(/\s+/g, ' ');
        console.warn(`[OmniRoute] Pass#${passIdx + 1} Key#${kIdx + 1} (${candidate.model}): ${shortMsg}`);

        if (isAuthError(msg)) {
          state.invalidUntil = Date.now() + 10 * 60 * 1000;
          state.failCount++;
          continue;
        }

        if (isQuotaError(msg)) {
          state.cooldownUntil = Date.now() + getQuotaCooldownMs(msg);
          state.failCount++;
          continue;
        }

        state.failCount++;
      }
    }
  }

  throw primaryError || lastError || new Error('OMNIROUTE_EXHAUSTED');
}

function mapGeminiError(error: unknown): { status: number; message: string } {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.includes('API_KEY_INVALID') || raw.includes('PERMISSION_DENIED') || raw.includes('403')) {
    return {
      status: 401,
      message:
        "API kaliti yaroqsiz yoki ruxsati yo'q. Settings > Secrets bo'limidan GEMINI_API_KEY ni tekshiring.",
    };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return {
      status: 429,
      message:
        "Google Gemini API kalitingizning daqiqalik yoki kunlik bepul limiti vaqtincha tugadi. 30-60 soniya kutib qayta urinib ko'ring (yoki yangi API kalit kiriting).",
    };
  }
  if (raw.includes('503') || raw.includes('UNAVAILABLE') || raw.includes('TIMEOUT:')) {
    return {
      status: 429,
      message:
        "AI serveri hozir band yoki javob kechikdi. Iltimos, yana bir marta bosib ko'ring.",
    };
  }
  if (raw.includes('NOT_FOUND') || raw.includes('404')) {
    return {
      status: 404,
      message: "Tanlangan AI modeli topilmadi. Tizim sozlamalarini tekshiring.",
    };
  }
  return {
    status: 500,
    message: `Javob tayyorlashda xatolik yuz berdi: ${raw}`,
  };
}

const lessonResponseSchema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: 'Oddiy va tushunarli dars sarlavhasi',
    },
    subject: {
      type: Type.STRING,
      description: 'Fan yoki soha nomi (masalan: Matematika, Dasturlash, Fizika)',
    },
    directAnswer: {
      type: Type.STRING,
      description: "Savolga qisqa, sodda va tushunarli asosiy javob (2-3 oddiy gapda)",
    },
    corePrinciple: {
      type: Type.STRING,
      description: "Mavzuning asosiy g'oyasi oddiy hayotiy tilda (1-2 gapda)",
    },
    prerequisites: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Darsdan oldin bilib qo'yish kerak bo'lgan 2-3 ta oddiy so'z yoki tushuncha",
    },
    steps: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          stepNumber: { type: Type.INTEGER },
          title: { type: Type.STRING, description: 'Qadam nomi — oddiy harakat shaklida' },
          summary: {
            type: Type.STRING,
            description: 'Bu qadamda nima qilishimizning 1-2 gaplik sodda tushuntirishi',
          },
          howToDetails: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description:
              "Buni qo'l bilan qanday bajarishning 2-3 ta eng aniq, qisqa mayda qadami",
          },
          exampleLabel: {
            type: Type.STRING,
            description: "Namuna nomi (masalan: 'Oddiy misol', 'Kod namunasi')",
          },
          practicalExample: {
            type: Type.STRING,
            description: 'Qisqa va tushunarli ishlangan misol yoki kod',
          },
          whyReason: {
            type: Type.STRING,
            description:
              "Nega aynan shunday qildik? 1-2 gapda oddiy mantiqiy sababi",
          },
          whatIfChanged: {
            type: Type.STRING,
            description: "Boshqacha qilsak nima bo'ladi? (1 qisqa gap)",
          },
          commonMistake: {
            type: Type.STRING,
            description: "Ko'p qilinadigan oddiy xato (1 qisqa gap)",
          },
        },
        required: [
          'stepNumber',
          'title',
          'summary',
          'howToDetails',
          'exampleLabel',
          'practicalExample',
          'whyReason',
          'whatIfChanged',
          'commonMistake',
        ],
      },
      description: '3 ta aniq, lo‘nda va sodda dars qadami',
    },
    keyConcepts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          term: { type: Type.STRING },
          meaning: { type: Type.STRING, description: "Atamaning juda oddiy 1 gaplik ma'nosi" },
          roleInTopic: { type: Type.STRING, description: 'Bu mavzuda nima vazifa bajarishi (1 gap)' },
        },
        required: ['term', 'meaning', 'roleInTopic'],
      },
      description: 'Mavzudagi 3 ta asosiy so‘z va qisqa izohi',
    },
    whyQuizzes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: {
            type: Type.STRING,
            description:
              "Juda aniq, qisqa va tushunarli tekshiruv savoli (aniq bir misol yoki holat bo'yicha)",
          },
          options: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '4 ta qisqa, bir-biridan yaqqol farq qiladigan variant',
          },
          correctIndex: { type: Type.INTEGER },
          whyExplanation: {
            type: Type.STRING,
            description: "Nega bu javob to'g'riligining 1-2 oddiy gaplik tushuntirishi",
          },
        },
        required: ['question', 'options', 'correctIndex', 'whyExplanation'],
      },
      description: '2 ta sodda va tushunarli qisqa test savoli',
    },
    nextPracticePrompts: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Keyingi o'rganish uchun 3 ta oddiy savol g'oyasi",
    },
  },
  required: [
    'title',
    'subject',
    'directAnswer',
    'corePrinciple',
    'prerequisites',
    'steps',
    'keyConcepts',
    'whyQuizzes',
    'nextPracticePrompts',
  ],
};

const followUpSchema = {
  type: Type.OBJECT,
  properties: {
    directReply: {
      type: Type.STRING,
      description: "Savolga samimiy, sodda va aniq javob",
    },
    howToApply: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Amalda qanday bajarish bo'yicha 2-3 ta juda oddiy qadam",
    },
    whyItWorks: {
      type: Type.STRING,
      description: "Nega bunday bo'lishining oddiy hayotiy sababi",
    },
    example: {
      type: Type.STRING,
      description: 'Kichik va tushunarli misol',
    },
  },
  required: ['directReply', 'howToApply', 'whyItWorks', 'example'],
};

const examGenerateSchema = {
  type: Type.OBJECT,
  properties: {
    examTitle: {
      type: Type.STRING,
      description: 'Imtihonning qisqa va tushunarli sarlavhasi',
    },
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          questionNumber: { type: Type.INTEGER },
          questionType: {
            type: Type.STRING,
            description: "'how_to' (qanday bajarish) yoki 'why_logic' (nima uchun)",
          },
          relatedStepNumber: {
            type: Type.INTEGER,
            description: "Darsning qaysi qadamiga oidligi (1 dan boshlab)",
          },
          conceptTested: {
            type: Type.STRING,
            description: "Tekshirilayotgan qisqa mavzu nomi (2-4 so'z)",
          },
          question: {
            type: Type.STRING,
            description:
              "Qisqa, lo'nda va tushunarli savol (1-2 gap, chalg'ituvchi murakkab so'zlarsiz, aniq misol bilan)",
          },
          options: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description:
              '4 ta qisqa va tushunarli variant (har biri 3-10 so‘z, faqat bittasi aniq to‘g‘ri)',
          },
          correctIndex: {
            type: Type.INTEGER,
            description: "To'g'ri javob indeksi (0, 1, 2 yoki 3)",
          },
          explanation: {
            type: Type.STRING,
            description:
              "Nega shu javob to'g'ri ekanining oddiy o'zbek tilidagi qisqa izohi (1-2 gap)",
          },
        },
        required: [
          'questionNumber',
          'questionType',
          'relatedStepNumber',
          'conceptTested',
          'question',
          'options',
          'correctIndex',
          'explanation',
        ],
      },
      description: "Aynan 5 ta tushunarli, amaliy va mantiqiy imtihon savoli",
    },
  },
  required: ['examTitle', 'questions'],
};

const examEvaluateSchema = {
  type: Type.OBJECT,
  properties: {
    ustozSummary: {
      type: Type.STRING,
      description:
        "Ustozning o'quvchiga samimiy, sodda va qo'llab-quvvatlovchi xulosasi (2-3 oddiy gap)",
    },
    understoodTopics: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "O'quvchi yaxshi tushungan narsalar ro'yxati (oddiy tilda)",
    },
    misunderstoodTopics: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          topic: {
            type: Type.STRING,
            description: "O'quvchi qiynalgan yoki xato qilgan joy (qisqa)",
          },
          gapReason: {
            type: Type.STRING,
            description:
              "O'quvchi nimani chalkashtirgani va to'g'ri fikr qanday bo'lishi kerakligi haqida sodda izoh",
          },
          relatedStepNumber: { type: Type.INTEGER },
        },
        required: ['topic', 'gapReason', 'relatedStepNumber'],
      },
      description:
        "Xato qilingan joylar ro'yxati (agar hammasi to'g'ri bo'lsa bo'sh massiv)",
    },
    recommendation: {
      type: Type.STRING,
      description:
        "Agar xatolar bo'lsa 'remediate', agar o'quvchi yaxshi tushungan bo'lsa 'complete'",
    },
    remediationFocusPrompt: {
      type: Type.STRING,
      description:
        "Qayta tushuntirish darsi uchun oddiy va aniq savol matni",
    },
  },
  required: [
    'ustozSummary',
    'understoodTopics',
    'misunderstoodTopics',
    'recommendation',
    'remediationFocusPrompt',
  ],
};

const pdfOutlineSchema = {
  type: Type.OBJECT,
  properties: {
    documentTitle: {
      type: Type.STRING,
      description: 'PDF hujjatning asosiy sarlavhasi',
    },
    subject: {
      type: Type.STRING,
      description: 'PDF qaysi fanga yoki mavzuga tegishli ekanligi',
    },
    sections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          sectionNumber: { type: Type.INTEGER },
          title: {
            type: Type.STRING,
            description: "Bo'lim yoki qadam nomi (qisqa va tushunarli)",
          },
          summary: {
            type: Type.STRING,
            description: "Shu bo'limda nima tushuntirilganining 1 gaplik qisqa mazmuni",
          },
          pageHint: {
            type: Type.STRING,
            description: "Taxminiy joyi yoki bet raqami (masalan: '1-bet' yoki '1-qadam')",
          },
        },
        required: ['sectionNumber', 'title', 'summary', 'pageHint'],
      },
      description: "PDF ichidagi 3 dan 7 tagacha asosiy bo'limlar yoki qadamlar ro'yxati",
    },
  },
  required: ['documentTitle', 'subject', 'sections'],
};

function getLevelInstruction(level: string): string {
  if (level === 'beginner') {
    return "O'quvchi darajasi: NOLDAN O'RGANUVCHI. Hech qanday qiyin atama ishlatma. Xuddi 7-sinf o'quvchisiga tushuntirgandek juda oddiy, hayotiy misollar bilan yoz.";
  }
  if (level === 'deep') {
    return "O'quvchi darajasi: BATAFSIL / CHUQUR. Mexanizmni to'liq ochib ber, lekin baribir gaplarni qisqa, sodda va ravon yoz — quruq kitobiy til ishlatma.";
  }
  return "O'quvchi darajasi: O'RTA. Oddiy tushunarli til, aniq qadamlar va real amaliy misollar bilan tushuntir.";
}

export async function createApp(options: { skipFrontend?: boolean } = {}) {
  const app = express();
  app.use(express.json({ limit: '35mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      runtime: process.env.VERCEL ? 'vercel' : 'node',
      omniroute: getOmniRouteStats(),
    });
  });

  app.post('/api/ustoz/teach', async (req: Request, res: Response) => {
    if (getConfiguredApiKeys().length === 0) {
      res.status(500).json({
        error:
          "GEMINI_API_KEY sozlanmagan. Settings > Secrets bo'limiga API kalitni kiriting.",
      });
      return;
    }

    const {
      question,
      level = 'intermediate',
      subjectHint = '',
      imageBase64,
      imageMimeType,
      fileBase64,
      fileMimeType,
      pdfExtractedText,
      remediationContext,
      pdfFocusContext,
    } = req.body ?? {};

    if (!question || typeof question !== 'string' || !question.trim()) {
      res.status(400).json({ error: "Iltimos, savol yoki mavzu yozing." });
      return;
    }

    const levelGuide = getLevelInstruction(String(level));
    const thinkingLevel = ThinkingLevel.LOW;

    const remediationNote =
      remediationContext && typeof remediationContext === 'object'
        ? `\nDIQQAT — QAYTA TUSHUNTIRISH DARSI:
O'quvchi oldingi imtihonda mana bu joylarda xato qildi:
${JSON.stringify(remediationContext.misunderstoodTopics || [])}
Vazifangiz: Aynan shu joylarni avvalgidan ANCHA SODDAROQ qilib, yangi oddiy hayotiy o'xshatish va mayda qadamlar bilan qayta tushuntiring.`
        : '';

    const pdfFocusNote =
      pdfFocusContext && typeof pdfFocusContext === 'object'
        ? `\nDIQQAT — YUKLANGAN PDF BO'YICHA TUSHUNTIRISH:
O'quvchi "${String(pdfFocusContext.documentTitle || 'dars.pdf')}" faylini qayta yukladi va quyidagi bo'limlar/joylarni tushunmaganini ko'rsatdi:
Tanlangan bo'limlar: ${JSON.stringify(pdfFocusContext.selectedSections || [])}
${pdfExtractedText ? `\nPDF MATNI:\n${String(pdfExtractedText).slice(0, 14000)}\n` : ''}
Vazifangiz: Shu PDF mazmuniga tayanib, o'quvchi tushunmagan aynan shu joylarni avvalgidan ancha sodda, mayda qadamlar va "Nima uchun shunday?" mantiqi bilan qaytadan tushuntirib bering.`
        : '';

    const systemInstruction = `Sen "Ustoz AI" — o'quvchining yonida o'tirgan mehribon, sabrli va hamma narsani juda sodda tushuntiradigan ustozsan.

ENG MUHIM QOIDALAR:
1) ODDIY VA RAVON TIL: Qiyin ilmiy, rasmiy yoki kitobiy so'zlarni ishlatma ("koeffitsiyent", "metodologiya", "diagnostika", "interaktiv", "kontseptsiya" kabi og'ir so'zlardan qoch). Oddiy xalqona va maktab o'quvchisi darhol tushunadigan jonli o'zbek tilida yoz. Gaplar qisqa bo'lsin!
2) QANDAY BAJARILADI (Mayda detallargacha): Har bir qadamda o'quvchi aynan qo'li bilan nima qilishini, nimani qayerga qo'yishini bitta-bitta ko'rsat. Hech narsani "o'zi tushunib oladi" deb tashlab ketma.
3) NIMA UCHUN SHUNDAY (Sababi): Har bir qadamda "Nega bunday qildik?" savoliga oddiy mantiqiy javob ber ("Chunki agar bunday qilmasak...").
4) TEZ VA LO'NDA YOZ: Har bir maydon qisqa, lo'nda va ortiqcha cho'zishsiz bo'lsin (3-4 ta aniq qadam, har qadamda 2-3 ta mayda band, 2 ta qisqa test).

${levelGuide}
${subjectHint ? `Mavzu sohasi: ${String(subjectHint)}` : ''}${remediationNote}${pdfFocusNote}`;

    const promptText = `O'quvchining savoli: "${question.trim()}"
Shu mavzuni juda tushunarli, mayda qadamlar bilan va har bir qadamning nega shunday qilinishini tushuntirib dars tayyorlab ber.`;

    try {
      const attachmentBase64 = fileBase64 || imageBase64;
      const attachmentMime = fileMimeType || imageMimeType;

      const contents =
        attachmentBase64 && attachmentMime
          ? {
              parts: [
                {
                  inlineData: {
                    mimeType: String(attachmentMime),
                    data: String(attachmentBase64),
                  },
                },
                { text: promptText },
              ],
            }
          : promptText;

      const response = await generateWithOmniRoute({
        contents,
        systemInstruction,
        thinkingLevel,
        responseSchema: lessonResponseSchema,
        timeoutMs: attachmentBase64 ? 24000 : 18000,
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(500).json({ error: "Model bo'sh javob qaytardi. Qayta urinib ko'ring." });
        return;
      }

      const parsed = JSON.parse(rawText);
      res.json({
        ...parsed,
        id: `lesson_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
        question: question.trim(),
        level,
        completionStatus: 'in_progress',
        isRemediation: Boolean(remediationContext || pdfFocusContext),
      });
    } catch (error) {
      const mapped = mapGeminiError(error);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.post('/api/ustoz/pdf/outline', async (req: Request, res: Response) => {
    if (getConfiguredApiKeys().length === 0) {
      res.status(500).json({
        error:
          "GEMINI_API_KEY sozlanmagan. Settings > Secrets bo'limiga API kalitni kiriting.",
      });
      return;
    }

    const { pdfBase64, fileName = 'dars.pdf' } = req.body ?? {};
    if (!pdfBase64 || typeof pdfBase64 !== 'string') {
      res.status(400).json({ error: "PDF fayl ma'lumoti topilmadi." });
      return;
    }

    try {
      const response = await generateWithOmniRoute({
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: pdfBase64,
              },
            },
            {
              text: `Ushbu "${String(fileName)}" PDF dars materialini o'qib chiq va uning ichidagi asosiy bo'limlar yoki qadamlarni oddiy o'zbek tilida ro'yxat qilib ber, toki o'quvchi aynan qaysi bo'limni tushunmaganini belgilay olsin.`,
            },
          ],
        },
        systemInstruction:
          "Sen Ustoz AI san. Yuklangan PDF hujjatdagi mavzu va bo'limlarni qisqa, sodda va tushunarli qilib ajratib ber.",
        thinkingLevel: ThinkingLevel.LOW,
        responseSchema: pdfOutlineSchema,
        timeoutMs: 20000,
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(500).json({ error: "PDF mazmuni o'qilmadi." });
        return;
      }

      const parsed = JSON.parse(rawText);
      res.json(parsed);
    } catch (error) {
      const mapped = mapGeminiError(error);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.post('/api/ustoz/followup', async (req: Request, res: Response) => {
    if (getConfiguredApiKeys().length === 0) {
      res.status(500).json({
        error:
          "GEMINI_API_KEY sozlanmagan. Settings > Secrets bo'limiga API kalitni kiriting.",
      });
      return;
    }

    const { lessonTitle, directAnswer, currentStep, followUpQuestion, level = 'intermediate', history = [] } =
      req.body ?? {};

    if (!followUpQuestion || typeof followUpQuestion !== 'string' || !followUpQuestion.trim()) {
      res.status(400).json({ error: "Savolingizni yozing." });
      return;
    }

    const levelGuide = getLevelInstruction(String(level));
    const recentHistory = Array.isArray(history)
      ? history
          .slice(-4)
          .map((m: { role?: string; text?: string }) => `${m.role === 'student' ? "O'quvchi" : 'Ustoz'}: ${m.text}`)
          .join('\n')
      : '';

    const systemInstruction = `Sen "Ustoz AI" san. O'quvchi qo'shimcha savol berdi.
Qiyin so'zlarsiz, juda sodda, qisqa va tushunarli o'zbek tilida javob ber:
1) Aniq javob.
2) Buni amalda qanday qilish (2-3 oddiy qadam).
3) Nima uchun shunday bo'lishining oddiy sababi.
${levelGuide}`;

    const prompt = `Dars: ${String(lessonTitle || '')}
Asosiy javob: ${String(directAnswer || '')}
${
  currentStep
    ? `Hozirgi qadam (${currentStep.stepNumber}-qadam: ${currentStep.title}): ${currentStep.summary}`
    : ''
}
${recentHistory ? `Oldingi suhbat:\n${recentHistory}\n` : ''}
O'quvchining savoli: "${followUpQuestion.trim()}"`;

    try {
      const response = await generateWithOmniRoute({
        contents: prompt,
        systemInstruction,
        thinkingLevel: ThinkingLevel.LOW,
        responseSchema: followUpSchema,
        timeoutMs: 15000,
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(500).json({ error: "Model bo'sh javob qaytardi." });
        return;
      }

      const parsed = JSON.parse(rawText);
      res.json(parsed);
    } catch (error) {
      const mapped = mapGeminiError(error);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.post('/api/ustoz/exam/generate', async (req: Request, res: Response) => {
    if (getConfiguredApiKeys().length === 0) {
      res.status(500).json({
        error:
          "GEMINI_API_KEY sozlanmagan. Settings > Secrets bo'limiga API kalitni kiriting.",
      });
      return;
    }

    const { lessonTitle, subject, level = 'intermediate', directAnswer, steps = [] } = req.body ?? {};
    if (!lessonTitle || !Array.isArray(steps) || steps.length === 0) {
      res.status(400).json({ error: "Imtihon tuzish uchun dars ma'lumotlari yetarli emas." });
      return;
    }

    const levelGuide = getLevelInstruction(String(level));
    const stepsDigest = steps
      .map(
        (s: { stepNumber?: number; title?: string; summary?: string; whyReason?: string }) =>
          `${s.stepNumber}-qadam (${s.title}): ${s.summary} | Sabab: ${s.whyReason}`,
      )
      .join('\n');

    const systemInstruction = `Sen "Ustoz AI" san. O'quvchi darsni o'qib bo'ldi, endi 5 ta SODDA va TUSHUNARLI imtihon savoli tuz.

TEST TUZISHDA QAT'IY QOIDALAR:
1) Savollar chigal, uzun yoki ikki ma'noli BO'LMASIN. Har bir savol 1-2 ta qisqa, oddiy gapdan iborat bo'lsin.
2) Mavhum nazariya so'rama! Aniq bitta kichik misol yoki vaziyat ber (masalan: "Agar x = 2 bo'lsa, keyingisi nima bo'ladi?" yoki "Nega bu yerda 0 ga bo'lish mumkin emas?").
3) 4 ta javob variantining har biri qisqa (3-10 so'z), aniq va oson o'qiladigan bo'lsin. Faqat BITTA variant aniq to'g'ri bo'lsin, qolganlari tushunarsiz emas, balki oddiy ko'p uchraydigan xatolar bo'lsin.
4) ${levelGuide}
5) Hamma matn oddiy, tushunarli o'zbek tilida (lotin alifbosida) bo'lsin.`;

    const prompt = `Dars: ${String(lessonTitle)}
Fan: ${String(subject || '')}
Asosiy javob: ${String(directAnswer || '')}
Dars qadamlari:
${stepsDigest}

Shu dars bo'yicha o'quvchi tushungan yoki tushunmaganini aniq bilib oladigan 5 ta sodda, tushunarli test savoli tuz.`;

    try {
      const response = await generateWithOmniRoute({
        contents: prompt,
        systemInstruction,
        thinkingLevel: ThinkingLevel.LOW,
        responseSchema: examGenerateSchema,
        timeoutMs: 20000,
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(500).json({ error: "Imtihon savollari yaratilmadi." });
        return;
      }

      const parsed = JSON.parse(rawText);
      const questions = Array.isArray(parsed.questions)
        ? parsed.questions.map((q: Record<string, unknown>, idx: number) => ({
            ...q,
            id: `eq_${Date.now()}_${idx}`,
            questionNumber: Number(q.questionNumber || idx + 1),
            questionType: q.questionType === 'why_logic' ? 'why_logic' : 'how_to',
          }))
        : [];

      res.json({
        examTitle: parsed.examTitle || `${lessonTitle} — Tekshiruv testi`,
        level,
        questions,
      });
    } catch (error) {
      const mapped = mapGeminiError(error);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.post('/api/ustoz/exam/evaluate', async (req: Request, res: Response) => {
    if (getConfiguredApiKeys().length === 0) {
      res.status(500).json({
        error:
          "GEMINI_API_KEY sozlanmagan. Settings > Secrets bo'limiga API kalitni kiriting.",
      });
      return;
    }

    const { lessonTitle, level = 'intermediate', questions = [], selectedAnswers = {} } = req.body ?? {};
    if (!Array.isArray(questions) || questions.length === 0) {
      res.status(400).json({ error: "Baholash uchun test savollari topilmadi." });
      return;
    }

    const answersReview = questions.map((q: {
      questionNumber: number;
      correctIndex: number;
      question: string;
      options: string[];
      conceptTested: string;
      relatedStepNumber: number;
      explanation?: string;
    }, idx: number) => {
      const selected = typeof selectedAnswers[idx] === 'number' ? selectedAnswers[idx] : -1;
      return {
        questionNumber: q.questionNumber || idx + 1,
        selectedIndex: selected,
        correctIndex: q.correctIndex,
        isCorrect: selected === q.correctIndex,
        question: q.question,
        conceptTested: q.conceptTested,
        relatedStepNumber: q.relatedStepNumber || 1,
        explanation: q.explanation || '',
        chosenText: selected >= 0 && q.options[selected] ? q.options[selected] : 'Javob belgilanmagan',
        correctText: q.options[q.correctIndex] || '',
      };
    });

    const correctCount = answersReview.filter((a) => a.isCorrect).length;
    const totalCount = answersReview.length;
    const percentage = Math.round((correctCount / totalCount) * 100);
    const passed = percentage >= 80;

    // Instant fast-path when student answered every question correctly (0ms AI wait)
    if (correctCount === totalCount) {
      res.json({
        correctCount,
        totalCount,
        percentage,
        passed: true,
        recommendation: 'complete',
        ustozSummary: `Ajoyib! Barcha ${totalCount} ta savolga to'g'ri javob berdingiz. Mavzuni ham amalda, ham mantiqan to'liq tushungansiz.`,
        understoodTopics: answersReview.map(
          (r) => `${r.relatedStepNumber}-qadam: ${r.conceptTested}`,
        ),
        misunderstoodTopics: [],
        remediationFocusPrompt: '',
        answersReview: answersReview.map((r) => ({
          questionNumber: r.questionNumber,
          selectedIndex: r.selectedIndex,
          correctIndex: r.correctIndex,
          isCorrect: r.isCorrect,
        })),
      });
      return;
    }

    const systemInstruction = `Sen "Ustoz AI" san. O'quvchining test natijasini oddiy, iliq va juda qisqa tilda tahlil qil.
Qoidalar:
1) Murakkab so'zlarsiz, qisqa yoz!
2) To'g'ri topgan savollari bo'yicha "nimalarni tushunganini" sanab ber.
3) Faqat XATO qilgan savollari bo'yicha "nimani chalkashtirganini" qisqacha tushuntir.
4) Agar natija 80% dan past bo'lsa, recommendation = 'remediate' qil va tushunmagan joylarni qayta sodda o'rgatadigan 'remediationFocusPrompt' yoz. Agar >= 80% bo'lsa recommendation = 'complete' qil.`;

    const digest = answersReview
      .map(
        (r) =>
          `${r.questionNumber}-savol [${r.conceptTested} · ${r.relatedStepNumber}-qadam]: ${
            r.isCorrect ? "TO'G'RI" : `XATO (O'quvchi: "${r.chosenText}" | To'g'ri: "${r.correctText}")`
          }`,
      )
      .join('\n');

    const prompt = `Dars: ${String(lessonTitle || '')}
Daraja: ${String(level)}
Ball: ${correctCount} / ${totalCount} (${percentage}%)

Natijalar:
${digest}`;

    try {
      const response = await generateWithOmniRoute({
        contents: prompt,
        systemInstruction,
        thinkingLevel: ThinkingLevel.LOW,
        responseSchema: examEvaluateSchema,
        timeoutMs: 12000,
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        throw new Error('Empty evaluation response');
      }

      const parsed = JSON.parse(rawText);
      const recommendation =
        parsed.recommendation === 'complete' && passed ? 'complete' : 'remediate';

      res.json({
        correctCount,
        totalCount,
        percentage,
        passed,
        recommendation,
        ustozSummary: parsed.ustozSummary,
        understoodTopics: parsed.understoodTopics || [],
        misunderstoodTopics: parsed.misunderstoodTopics || [],
        remediationFocusPrompt: parsed.remediationFocusPrompt || '',
        answersReview: answersReview.map((r) => ({
          questionNumber: r.questionNumber,
          selectedIndex: r.selectedIndex,
          correctIndex: r.correctIndex,
          isCorrect: r.isCorrect,
        })),
      });
    } catch {
      const wrongItems = answersReview.filter((r) => !r.isCorrect);
      const rightItems = answersReview.filter((r) => r.isCorrect);
      const recommendation = passed ? 'complete' : 'remediate';

      res.json({
        correctCount,
        totalCount,
        percentage,
        passed,
        recommendation,
        ustozSummary: passed
          ? `Yaxshi natija! ${totalCount} ta savoldan ${correctCount} tasiga to'g'ri javob berdingiz. Asosiy tushunchalarni yaxshi o'zlashtirgansiz.`
          : `${totalCount} ta savoldan ${correctCount} tasiga to'g'ri javob berdingiz. Xato qilingan joylarni oddiy misollar bilan qayta ko'rib chiqamiz.`,
        understoodTopics: rightItems.map(
          (r) => `${r.relatedStepNumber}-qadam: ${r.conceptTested}`,
        ),
        misunderstoodTopics: wrongItems.map((r) => ({
          topic: r.conceptTested,
          gapReason:
            r.explanation ||
            `Siz "${r.chosenText}" javobini tanladingiz, lekin to'g'ri javob "${r.correctText}".`,
          relatedStepNumber: r.relatedStepNumber,
        })),
        remediationFocusPrompt: wrongItems.length
          ? `"${String(lessonTitle || '')}" darsidagi quyidagi tushunilmagan joylarni juda oddiy tilda qayta tushuntiring: ${wrongItems
              .map((w) => w.conceptTested)
              .join(', ')}`
          : '',
        answersReview: answersReview.map((r) => ({
          questionNumber: r.questionNumber,
          selectedIndex: r.selectedIndex,
          correctIndex: r.correctIndex,
          isCorrect: r.isCorrect,
        })),
      });
    }
  });

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: "API manzili topilmadi." });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: () => void) => {
    const errObj = err as { type?: string; status?: number; message?: string };
    if (errObj?.type === 'entity.too.large' || errObj?.status === 413) {
      res.status(413).json({
        error: "Yuklangan fayl hajmi juda katta. Iltimos, 10 MB dan kichikroq fayl yuklang.",
      });
      return;
    }
    if (errObj?.type === 'entity.parse.failed' || errObj?.status === 400) {
      res.status(400).json({
        error: "Yuborilgan ma'lumot formatida xatolik bor.",
      });
      return;
    }
    res.status(errObj?.status || 500).json({
      error: "Serverda kutilmagan xatolik yuz berdi. Qayta urinib ko'ring.",
    });
  });

  if (!options.skipFrontend) {
    const distDir = path.resolve(__dirname, 'dist');
    const hasDistBuild = fs.existsSync(path.join(distDir, 'index.html'));

    if (isProduction && hasDistBuild) {
      app.use(express.static(distDir));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    } else {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    }
  }

  return app;
}

async function startServer() {
  const app = await createApp();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Ustoz AI server listening on http://0.0.0.0:${PORT}`);
  });
}

if (
  !process.env.VERCEL &&
  !process.env.AWS_LAMBDA_FUNCTION_NAME &&
  !process.env.NETLIFY
) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
