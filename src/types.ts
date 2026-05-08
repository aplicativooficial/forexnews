export interface NewsItem {
  id: string;
  title: string;
  source: string;
  time: string;
  description: string;
  url: string;
  impact: 'high' | 'medium' | 'low';
  currency?: string;
  summary?: string;
  keyPoints?: string[];
  fullContent?: string;
}

export interface CommunityUpdate {
  id: string;
  title: string;
  subtitle?: string;
  content: string;
  date: string;
  type: 'update' | 'news' | 'novelty';
  imageUrl?: string;
  isImportant?: boolean;
  externalLink?: string;
  externalLinkText?: string;
}

export interface SocialProof {
  id: string;
  memberName: string;
  avatar?: string;
  result: string;
  testimonial: string;
  iaName: string;
  iaId?: string; // Reference to AI ID for synchronization
  date: string;
  imageUrl: string;
}

export interface BrokerBanner {
  id: string;
  brokerName: string;
  offer: string;
  badge: 'Recommended' | 'Exclusive Bonus' | 'Low Spread';
  imageUrl: string;
  ctaUrl: string;
}

export interface AIResult {
  id: string;
  name: string;
  source?: string; // New field for Broker/Brokerage name
  logo: string;
  currentMonthReturn: number;
  yearCumulativeReturn: number;
  maxDrawdown: number;
  totalTradesMonth: number;
  winRate: number;
  equityData: number[]; // For chart
  status: 'Active' | 'Maintenance' | 'Beta';
  trackingUrl?: string;
  lastSync?: string;
  isLive?: boolean;
}

export interface DailyAnalysis {
  date: string;
  text: string;
}
