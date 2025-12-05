import { Router } from "express";

const router = Router();

router.post("/openai", async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "OpenAI API ключ не настроен на сервере"
    });
  }

  const requestBody = req.body ?? {};

  if (!requestBody.model || !requestBody.messages) {
    return res.status(400).json({
      error: "Отсутствуют обязательные поля: model или messages"
    });
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

    return res.status(response.status).json(data);
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === "AbortError") {
      return res.status(504).json({
        error:
          "Превышено время ожидания ответа от OpenAI API. Попробуйте сократить запрос или использовать более быструю модель."
      });
    }

    console.error("Ошибка при проксировании запроса к OpenAI:", error);

    let errorMessage = "Неизвестная ошибка при обработке запроса";
    let statusCode = 500;

    if (error instanceof Error) {
      if (error.name === "AbortError" || error.message.includes("timeout")) {
        errorMessage = "Превышено время ожидания ответа от OpenAI API";
        statusCode = 504;
      } else if (error.message.includes("fetch")) {
        errorMessage =
          "Не удалось подключиться к OpenAI API. Проверьте интернет-соединение.";
        statusCode = 503;
      } else {
        errorMessage = error.message;
      }
    }

    return res.status(statusCode).json({ error: errorMessage });
  }
});

export default router;







