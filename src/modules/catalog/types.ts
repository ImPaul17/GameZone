export type SourceProvider = "pivigames" | "igdb" | "official" | "editorial";

export interface FieldEvidence {
  field: string;
  label: string;
  value: string;
  provider: SourceProvider;
  sourceUrl: string;
  retrievedAt: string;
  status: "reported" | "documented" | "conflict" | "pending";
}

export interface GameRequirements {
  platform: string;
  minimum: string[];
  recommended: string[];
}

export interface GameDistribution {
  label: string;
  version: string;
  size: string;
  format: string;
  links: { label: string; url: string; type: "base" | "update" | "extra" }[];
  installation: string[];
}

export interface GameContent {
  title: string;
  slug: string;
  summary: string;
  description: string[];
  coverImage: string;
  coverAlt: string;
  genres: string[];
  platforms: string[];
  developer: string;
  publisher: string;
  releaseDate: string;
  steamAppId: string;
  languages: string[];
  requirements: GameRequirements[];
  screenshots: string[];
  trailerUrl: string;
  distributions: GameDistribution[];
  evidence: FieldEvidence[];
}

export interface SourceIdentity {
  provider: "pivigames";
  id: string;
  url: string;
}

export interface ImportResult {
  content: GameContent;
  source: SourceIdentity;
  warnings: string[];
  fetchedAt: string;
}

export interface CatalogRecord {
  id: string;
  lockedSlug?: string | null;
  draft: GameContent;
  published: GameContent | null;
  publishedAt: string | null;
  source: SourceIdentity | null;
  lastImported: GameContent | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface PublishedGame extends GameContent {
  id: string;
  publishedAt: string;
  updatedAt: string;
}

export function emptyGame(): GameContent {
  return {
    title: "", slug: "", summary: "", description: [], coverImage: "", coverAlt: "",
    genres: [], platforms: ["Windows"], developer: "", publisher: "", releaseDate: "",
    steamAppId: "", languages: [], requirements: [], screenshots: [], trailerUrl: "",
    distributions: [], evidence: [],
  };
}

export function slugify(title: string): string {
  return title.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
