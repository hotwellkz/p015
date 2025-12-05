import { db, isFirestoreAvailable } from "./firebaseAdmin";
import { Logger } from "../utils/logger";
import { generateChannelPrompt } from "../utils/promptGenerator";

// Типы для канала (упрощённая версия из frontend)
interface Channel {
  id: string;
  name: string;
  platform: "YOUTUBE_SHORTS" | "TIKTOK" | "INSTAGRAM_REELS" | "VK_CLIPS";
  language: "ru" | "en" | "kk";
  targetDurationSec: number;
  niche: string;
  audience: string;
  tone: string;
  blockedTopics: string;
  extraNotes?: string;
  generationMode?: "script" | "prompt" | "video-prompt-only";
}

const LANGUAGE_NAMES: Record<Channel["language"], string> = {
  ru: "Русский",
  en: "English",
  kk: "Қазақша"
};

/**
 * Получает канал из Firestore
 */
async function getChannelFromFirestore(
  userId: string,
  channelId: string
): Promise<Channel | null> {
  if (!isFirestoreAvailable() || !db) {
    throw new Error("Firestore is not available");
  }

  const channelRef = db
    .collection("users")
    .doc(userId)
    .collection("channels")
    .doc(channelId);

  const channelSnap = await channelRef.get();

  if (!channelSnap.exists) {
    return null;
  }

  const data = channelSnap.data() as any;
  return {
    id: channelSnap.id,
    ...data
  } as Channel;
}

/**
 * Строит промпт для автогенерации идеи и сценариев
 * Использует универсальный генератор промптов
 */
function buildAutoGeneratePrompt(channel: Channel): string {
  // Используем универсальный генератор, но для автогенерации нужен JSON формат
  const { systemPrompt, userPrompt } = generateChannelPrompt(channel, "script");
  
  // Добавляем инструкцию по JSON формату для автогенерации
  return `${systemPrompt}

**Формат ответа (JSON):**

{
  "idea": "Краткое описание идеи ролика (1-2 предложения)",
  "scripts": [
    "Сценарий 1: [детальное описание с репликами и действиями]",
    "Сценарий 2: [детальное описание с репликами и действиями]",
    "Сценарий 3: [детальное описание с репликами и действиями] (опционально)"
  ]
}

Верни ТОЛЬКО валидный JSON, без дополнительных комментариев.`;
}

/**
 * Парсит ответ от OpenAI для автогенерации
 */
function parseAutoGenerateResponse(responseText: string): {
  idea: string;
  scripts: string[];
} {
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        idea: parsed.idea || "",
        scripts: Array.isArray(parsed.scripts) ? parsed.scripts : []
      };
    }
    throw new Error("JSON не найден в ответе");
  } catch (error) {
    Logger.error("Ошибка парсинга JSON:", error);
    // Fallback: пытаемся извлечь идею и сценарии из текста
    const ideaMatch = responseText.match(/иде[яи][:]\s*(.+?)(?:\n|$)/i);
    const scripts: string[] = [];
    
    const lines = responseText.split("\n").filter((line) => line.trim());
    let currentScript = "";
    let inScript = false;
    
    for (const line of lines) {
      if (line.match(/сценарий\s*\d+[:]/i)) {
        if (currentScript) {
          scripts.push(currentScript.trim());
        }
        currentScript = line + "\n";
        inScript = true;
      } else if (inScript) {
        currentScript += line + "\n";
      }
    }
    
    if (currentScript) {
      scripts.push(currentScript.trim());
    }
    
    return {
      idea: ideaMatch ? ideaMatch[1].trim() : "Идея не найдена",
      scripts: scripts.length > 0 ? scripts : [responseText]
    };
  }
}

/**
 * Генерирует промпт для канала через OpenAI API
 */
async function callOpenAIProxy(
  requestBody: Record<string, unknown>
): Promise<any> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OpenAI API ключ не настроен на сервере");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const data = await response
      .json()
      .catch(() => ({ error: { message: "Не удалось распарсить ответ от OpenAI API" } }));

    if (!response.ok) {
      throw new Error(data.error?.message || `OpenAI API ошибка: ${response.status}`);
    }

    return data;
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Превышено время ожидания ответа от OpenAI API");
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error("Неизвестная ошибка при обработке запроса");
  }
}

/**
 * Строит промпт для генерации VIDEO_PROMPT на основе идеи
 * Использует универсальный генератор промптов
 */
function buildVideoPromptGenerationPrompt(channel: Channel, idea: string): string {
  const { systemPrompt, userPrompt } = generateChannelPrompt(channel, "video-prompt-only", idea);
  
  // Для генерации VIDEO_PROMPT нужны дополнительные инструкции
  const lang = channel.language;
  const languageName = LANGUAGE_NAMES[channel.language];
  
  const additionalInstructions = {
    ru: `**Требования к VIDEO_PROMPT:**

1. Укажи длительность: "${channel.targetDurationSec}-секундное видео, вертикальный формат 9:16"
2. Стиль съёмки: выбери на основе тона "${channel.tone}"
3. Локация и сеттинг: укажи тип локации (кухня, улица, комната и т.д.), сезон/погоду если релевантно
4. Персонажи: опиши внешний вид главных персонажей
5. Движение камеры: выбери статичную камеру, лёгкое движение камеры от руки или плавный панорамный кадр на основе динамики сюжета
6. Действия по временным отрезкам: кратко опиши ключевые действия для каждого временного отрезка (0-2с, 2-4с и т.д.)
7. Реплики: укажи, что персонажи говорят на ${languageName} языке, включи ключевые реплики
8. Запреты: без текстовых наложений, без субтитров, без логотипов, без водяных знаков, без текста на экране

**Формат ответа:**

Верни ТОЛЬКО текст VIDEO_PROMPT, без дополнительных комментариев, без JSON, просто готовый промпт для Sora/Veo. ВСЁ должно быть на русском языке, включая все технические указания, описания и требования.`,
    en: `**VIDEO_PROMPT Requirements:**

1. Specify duration: "${channel.targetDurationSec}-second video, vertical 9:16 aspect ratio"
2. Shooting style: choose based on tone "${channel.tone}"
3. Location and setting: specify location type (kitchen, street, room, etc.), season/weather if relevant
4. Characters: describe the appearance of main characters
5. Camera movement: choose static camera, slight handheld movement or smooth pan based on story dynamics
6. Actions by time segments: briefly describe key actions for each time segment (0-2s, 2-4s, etc.)
7. Dialogue: specify that characters speak in ${languageName}, include key dialogue
8. Restrictions: no text overlays, no subtitles, no logos, no watermarks, no text on screen

**Response Format:**

Return ONLY the VIDEO_PROMPT text, without additional comments, without JSON, just a ready prompt for Sora/Veo. EVERYTHING must be in English, including all technical instructions, descriptions and requirements.`,
    kk: `**VIDEO_PROMPT талаптары:**

1. Ұзақтықты көрсет: "${channel.targetDurationSec} секундтық бейне, тік 9:16 формат"
2. Түсіру стилі: "${channel.tone}" тоны негізінде таңда
3. Орналасу және декорация: орналасу түрін көрсет (аспазхана, көше, бөлме және т.б.), мезгіл/ауа райын релевантты болса көрсет
4. Кейіпкерлер: негізгі кейіпкерлердің сыртқы түрін сипатта
5. Камера қозғалысы: сценарий динамикасы негізінде статикалық камера, қолдан ұстағандағы жеңіл қозғалыс немесе тегіс панорамалық кадрды таңда
6. Уақыт сегменттері бойынша әрекеттер: әр уақыт сегменті үшін негізгі әрекеттерді қысқаша сипатта (0-2с, 2-4с және т.б.)
7. Репликалар: кейіпкерлер ${languageName} тілінде сөйлейтінін көрсет, негізгі репликаларды қос
8. Тыйымдар: мәтін қабаттары жоқ, субтитрлер жоқ, логотиптер жоқ, су белгілері жоқ, экранда мәтін жоқ

**Жауап форматы:**

Тек VIDEO_PROMPT мәтінін қайтар, қосымша түсініктемелерсіз, JSON-сыз, тек Sora/Veo үшін дайын промпт. БАРЛЫҒЫ қазақ тілінде болуы керек, барлық техникалық нұсқаулар, сипаттамалар және талаптарды қоса алғанда.`
  };

  return `${systemPrompt}

${additionalInstructions[lang]}`;
}

/**
 * Генерирует VIDEO_PROMPT на основе идеи (для режима video-prompt-only)
 */
async function generateVideoPromptFromIdea(
  channel: Channel,
  idea: string
): Promise<string> {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const videoPromptText = buildVideoPromptGenerationPrompt(channel, idea);

  const requestBody: Record<string, unknown> = {
    model,
    messages: [
      {
        role: "system",
        content: videoPromptText
      },
      {
        role: "user",
        content: idea
          ? `Создай VIDEO_PROMPT для идеи: "${idea}"`
          : "Создай VIDEO_PROMPT для этого канала."
      }
    ],
    temperature: 0.7,
    max_tokens: 1500
  };

  const data = await callOpenAIProxy(requestBody);
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Пустой ответ от OpenAI API при генерации VIDEO_PROMPT");
  }

  // Очищаем ответ от возможных JSON-обёрток или лишних комментариев
  let videoPrompt = content.trim();
  
  // Удаляем возможные JSON-обёртки
  const jsonMatch = videoPrompt.match(/\{[\s\S]*"videoPrompt"[\s\S]*:[\s\S]*"([^"]+)"[\s\S]*\}/i);
  if (jsonMatch) {
    videoPrompt = jsonMatch[1];
  } else {
    // Удаляем возможные markdown-коды
    videoPrompt = videoPrompt.replace(/```[\w]*\n?/g, "").replace(/```/g, "");
    // Удаляем возможные заголовки типа "VIDEO_PROMPT:" или "Prompt:"
    videoPrompt = videoPrompt.replace(/^(VIDEO_PROMPT|Prompt|Промпт)[:\s]*/i, "");
  }

  return videoPrompt.trim();
}

/**
 * Генерирует промпт для канала (использует ту же логику, что и кнопка "ИИ-идея")
 * @param channelId - ID канала
 * @param userId - ID владельца канала
 * @returns Объект с промптом (videoPrompt для режима video-prompt-only, сценарий для script, videoPrompt для prompt)
 */
export async function generatePromptForChannel(
  channelId: string,
  userId: string
): Promise<{ prompt: string; title?: string }> {
  Logger.info("Generating prompt for channel", { channelId, userId });

  // Получаем канал из Firestore
  const channel = await getChannelFromFirestore(userId, channelId);
  if (!channel) {
    throw new Error(`Канал с ID ${channelId} не найден`);
  }

  const mode = channel.generationMode || "script";

  Logger.info("Channel generation mode", { channelId, mode });

  // Используем универсальный генератор промптов
  const { systemPrompt, userPrompt: baseUserPrompt } = generateChannelPrompt(channel, mode);
  
  // Для автогенерации нужен JSON формат, поэтому используем buildAutoGeneratePrompt
  const systemPromptForAuto = buildAutoGeneratePrompt(channel);
  const userPrompt = "Придумай идею и создай сценарии для этого канала.";

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const supportsJsonMode = model.includes("gpt-4") || model.includes("o3");

  const requestBody: Record<string, unknown> = {
    model,
    messages: [
      {
        role: "system",
        content: systemPromptForAuto
      },
      {
        role: "user",
        content: userPrompt
      }
    ],
    temperature: 0.9,
    max_tokens: 2000
  };

  if (supportsJsonMode) {
    requestBody.response_format = { type: "json_object" };
  }

  try {
    // Шаг 1: Генерируем идею и сценарии
    const data = await callOpenAIProxy(requestBody);
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Пустой ответ от OpenAI API");
    }

    const result = parseAutoGenerateResponse(content);
    const idea = result.idea || "";

    if (!idea) {
      throw new Error("Не удалось сгенерировать идею");
    }

    let prompt: string;
    let promptType: "scenario" | "videoPrompt" | "both";

    // Шаг 2: В зависимости от режима формируем текст для отправки
    if (mode === "video-prompt-only") {
      // Для режима "video-prompt-only" генерируем и отправляем только VIDEO_PROMPT
      Logger.info("Generating VIDEO_PROMPT for video-prompt-only mode", { channelId });
      prompt = await generateVideoPromptFromIdea(channel, idea);
      promptType = "videoPrompt";
    } else if (mode === "prompt") {
      // Для режима "prompt" генерируем VIDEO_PROMPT на основе первого сценария
      if (result.scripts.length === 0) {
        throw new Error("Не удалось сгенерировать сценарий для режима 'prompt'");
      }
      
      Logger.info("Generating VIDEO_PROMPT for prompt mode", { channelId });
      
      // Создаём упрощённый сценарий для генерации VIDEO_PROMPT
      const simplifiedScenario = {
        title: idea,
        durationSeconds: channel.targetDurationSec,
        steps: [
          {
            secondFrom: 0,
            secondTo: channel.targetDurationSec,
            description: result.scripts[0],
            dialog: []
          }
        ]
      };

      // Генерируем VIDEO_PROMPT на основе сценария
      const videoPromptText = buildVideoPromptGenerationPrompt(channel, `${idea}\n\nСценарий:\n${result.scripts[0]}`);
      
      const videoRequestBody: Record<string, unknown> = {
        model,
        messages: [
          {
            role: "system",
            content: videoPromptText
          },
          {
            role: "user",
            content: `Создай VIDEO_PROMPT для следующего сценария:\n\n${result.scripts[0]}`
          }
        ],
        temperature: 0.7,
        max_tokens: 1500
      };

      const videoData = await callOpenAIProxy(videoRequestBody);
      const videoContent = videoData.choices?.[0]?.message?.content;

      if (!videoContent) {
        throw new Error("Пустой ответ от OpenAI API при генерации VIDEO_PROMPT");
      }

      // Очищаем ответ от возможных JSON-обёрток или лишних комментариев
      let videoPrompt = videoContent.trim();
      const jsonMatch = videoPrompt.match(/\{[\s\S]*"videoPrompt"[\s\S]*:[\s\S]*"([^"]+)"[\s\S]*\}/i);
      if (jsonMatch) {
        videoPrompt = jsonMatch[1];
      } else {
        videoPrompt = videoPrompt.replace(/```[\w]*\n?/g, "").replace(/```/g, "");
        videoPrompt = videoPrompt.replace(/^(VIDEO_PROMPT|Prompt|Промпт)[:\s]*/i, "");
      }

      prompt = videoPrompt.trim();
      promptType = "videoPrompt";
    } else {
      // Для режима "script" отправляем первый сценарий
      prompt = result.scripts[0] || idea;
      promptType = "scenario";
    }

    if (!prompt || prompt.trim().length === 0) {
      throw new Error("Не удалось сгенерировать промпт");
    }

    Logger.info("Prompt generated successfully", {
      channelId,
      mode,
      promptType,
      promptLength: prompt.length,
      idea: idea.substring(0, 100) + "..."
    });

    return {
      prompt: prompt.trim(),
      title: idea || undefined
    };
  } catch (error) {
    Logger.error("Failed to generate prompt", { channelId, mode, error });
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Неизвестная ошибка при генерации промпта");
  }
}

