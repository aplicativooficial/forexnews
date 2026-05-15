import { AIResult, CommunityUpdate, DailyAnalysis } from "../types";

const API_BASE = "/api";
export const API_ROOT = API_BASE;

export async function handleResponse(res: Response) {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`API Error: ${res.status} ${res.statusText} - ${text.substring(0, 100)}`);
  }
  if (!text || text.trim() === "") return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("JSON Parse Error info:", { text: text.substring(0, 100), status: res.status });
    // If it's HTML, return null or throw clearer error
    if (text.trim().startsWith("<!doctype") || text.trim().startsWith("<html")) {
        console.warn("Received HTML instead of JSON from", res.url);
        return null;
    }
    throw e;
  }
}

export const api = {
  // AI Results
  getAIResults: async (): Promise<AIResult[]> => {
    const res = await fetch(`${API_BASE}/ai-results`);
    return handleResponse(res);
  },
  saveAIResult: async (ai: AIResult): Promise<void> => {
    const res = await fetch(`${API_BASE}/ai-results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ai),
    });
    await handleResponse(res);
  },
  deleteAIResult: async (id: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/ai-results/${encodeURIComponent(id)}`, { method: "DELETE" });
    await handleResponse(res);
  },

  // Community
  getCommunityUpdates: async (): Promise<CommunityUpdate[]> => {
    const res = await fetch(`${API_BASE}/community`);
    return handleResponse(res);
  },
  saveCommunityUpdate: async (update: CommunityUpdate): Promise<void> => {
    const res = await fetch(`${API_BASE}/community`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    await handleResponse(res);
  },
  deleteCommunityUpdate: async (id: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/community/${encodeURIComponent(id)}`, { method: "DELETE" });
    await handleResponse(res);
  },

  // Analysis
  getDailyAnalysis: async (): Promise<DailyAnalysis | null> => {
    const res = await fetch(`${API_BASE}/analysis`);
    return handleResponse(res);
  },
  saveDailyAnalysis: async (analysis: DailyAnalysis): Promise<void> => {
    const res = await fetch(`${API_BASE}/analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(analysis),
    });
    await handleResponse(res);
  },

  // Config
  getConfig: async (id: string) => {
    const res = await fetch(`${API_BASE}/config/${encodeURIComponent(id)}`);
    return handleResponse(res);
  },
  saveConfig: async (id: string, value: any) => {
    const res = await fetch(`${API_BASE}/config/${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value)
    });
    await handleResponse(res);
  },

  // News Cache
  getNewsCache: async (id: string) => {
    const res = await fetch(`${API_BASE}/news-cache?id=${encodeURIComponent(id)}`);
    return handleResponse(res);
  },
  saveNewsCache: async (data: any) => {
    const res = await fetch(`${API_BASE}/news-cache`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    await handleResponse(res);
  },

  processAi: async (prompt: string, type: 'text' | 'json' = 'text', stream = false) => {
    return fetch(`${API_BASE}/ai-process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, type, stream })
    });
  },
};
