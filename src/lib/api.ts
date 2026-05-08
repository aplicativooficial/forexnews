import { AIResult, CommunityUpdate, DailyAnalysis, SocialProof } from "../types";

const API_BASE = "/api";

export const api = {
  // AI Results
  getAIResults: async (): Promise<AIResult[]> => {
    const res = await fetch(`${API_BASE}/ai-results`);
    return res.json();
  },
  saveAIResult: async (ai: AIResult): Promise<void> => {
    await fetch(`${API_BASE}/ai-results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ai),
    });
  },
  deleteAIResult: async (id: string): Promise<void> => {
    await fetch(`${API_BASE}/ai-results/${id}`, { method: "DELETE" });
  },

  // Community
  getCommunityUpdates: async (): Promise<CommunityUpdate[]> => {
    const res = await fetch(`${API_BASE}/community`);
    return res.json();
  },
  saveCommunityUpdate: async (update: CommunityUpdate): Promise<void> => {
    await fetch(`${API_BASE}/community`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
  },
  deleteCommunityUpdate: async (id: string): Promise<void> => {
    await fetch(`${API_BASE}/community/${id}`, { method: "DELETE" });
  },

  // Analysis
  getDailyAnalysis: async (): Promise<DailyAnalysis | null> => {
    const res = await fetch(`${API_BASE}/analysis`);
    return res.json();
  },
  saveDailyAnalysis: async (analysis: DailyAnalysis): Promise<void> => {
    await fetch(`${API_BASE}/analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(analysis),
    });
  },

  // Social Proofs
  getSocialProofs: async (): Promise<SocialProof[]> => {
    const res = await fetch(`${API_BASE}/social-proofs`);
    return res.json();
  },
  saveSocialProof: async (proof: SocialProof): Promise<void> => {
    await fetch(`${API_BASE}/social-proofs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(proof),
    });
  },
  deleteSocialProof: async (id: string): Promise<void> => {
    await fetch(`${API_BASE}/social-proofs/${id}`, { method: "DELETE" });
  },

  // Banners
  getBanners: async () => {
    const res = await fetch(`${API_BASE}/banners`);
    return res.json();
  },
  saveBanner: async (banner: any) => {
    await fetch(`${API_BASE}/banners`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(banner)
    });
  },
  deleteBanner: async (id: string) => {
    await fetch(`${API_BASE}/banners/${id}`, { method: 'DELETE' });
  },

  // Config
  getConfig: async (id: string) => {
    const res = await fetch(`${API_BASE}/config/${id}`);
    return res.json();
  },
  saveConfig: async (id: string, value: any) => {
    await fetch(`${API_BASE}/config/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value)
    });
  },

  // News Cache
  getNewsCache: async (id: string) => {
    const res = await fetch(`${API_BASE}/news-cache/${id}`);
    return res.json();
  },
  saveNewsCache: async (data: any) => {
    await fetch(`${API_BASE}/news-cache`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  },
};
