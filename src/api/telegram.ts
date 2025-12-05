import axios from "axios";
import { getAuth } from "firebase/auth";

const backendBaseUrl =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ||
  "http://localhost:8080";

async function getAuthHeader() {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Not authenticated");
  }
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export async function telegramStart(phone: string) {
  const headers = await getAuthHeader();
  const res = await axios.post(
    `${backendBaseUrl}/api/telegram/start`,
    { phone },
    { headers }
  );
  return res.data as { status: string };
}

export async function telegramConfirm(
  phone: string,
  code: string,
  password?: string
) {
  const headers = await getAuthHeader();
  const res = await axios.post(
    `${backendBaseUrl}/api/telegram/confirm`,
    { phone, code, password },
    { headers }
  );
  return res.data as { status: string; phoneMasked?: string };
}

export async function telegramDisconnect() {
  const headers = await getAuthHeader();
  const res = await axios.post(
    `${backendBaseUrl}/api/telegram/disconnect`,
    {},
    { headers }
  );
  return res.data as { status: string };
}

export async function telegramStatus() {
  const headers = await getAuthHeader();
  const res = await axios.get(`${backendBaseUrl}/api/telegram/status`, {
    headers
  });
  return res.data as
    | { connected: false }
    | { connected: true; phoneMasked: string };
}

export async function telegramSendPrompt(channelId: string, prompt: string) {
  const headers = await getAuthHeader();
  const res = await axios.post(
    `${backendBaseUrl}/api/telegram/sendPrompt`,
    { channelId, prompt },
    { headers }
  );
  return res.data as { status: string; error?: string };
}

export async function sendPromptToSyntx(prompt: string) {
  const headers = await getAuthHeader();
  const res = await axios.post(
    `${backendBaseUrl}/api/telegram/sendPromptToSyntx`,
    { prompt },
    { headers }
  );
  return res.data as { status: string; error?: string; message?: string };
}

export async function fetchLatestVideoToDrive(channelId: string) {
  const headers = await getAuthHeader();
  const res = await axios.post(
    `${backendBaseUrl}/api/telegram/fetchLatestVideoToDrive`,
    { channelId },
    { headers }
  );
  return res.data as {
    status: string;
    driveFileId?: string;
    webViewLink?: string;
    webContentLink?: string;
    error?: string;
    message?: string;
  };
}

export async function fetchVideoAndUploadToDrive(
  channelId: string,
  googleDriveFolderId?: string,
  telegramMessageId?: number,
  videoTitle?: string
) {
  const headers = await getAuthHeader();
  const res = await axios.post(
    `${backendBaseUrl}/api/telegram/fetchVideoAndUploadToDrive`,
    { channelId, googleDriveFolderId, telegramMessageId, videoTitle },
    { headers }
  );
  return res.data as {
    status: string;
    fileId?: string;
    webViewLink?: string;
    webContentLink?: string;
    fileName?: string;
    message?: string;
  };
}


