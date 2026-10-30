export interface NewsContent {
  title: string;
  slug: string;
  summary: string;
  body: string[];
  coverImage: string;
  coverAlt: string;
  tags: string[];
  sourceUrl: string;
}

export interface NewsRecord {
  id: string;
  draft: NewsContent;
  published: NewsContent | null;
  publishedAt: string | null;
  lockedSlug: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface PublishedNews extends NewsContent {
  id: string;
  publishedAt: string;
  updatedAt: string;
}

export function emptyNews(): NewsContent {
  return { title: "", slug: "", summary: "", body: [], coverImage: "", coverAlt: "", tags: [], sourceUrl: "" };
}
