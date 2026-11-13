export type CategoryId =
  | "ai"
  | "tools"
  | "text"
  | "image"
  | "random"
  | "islami"
  | "info"
  | "komik"
  | "anime"
  | "canvas"
  | "search"
  | "downloader"
  | "games"
  | "film";

export type Param = {
  name: string;
  required?: boolean;
  description: string;
  example?: string;
  /** Pilihan tetap; di halaman docs ditampilkan sebagai tombol pilihan, bukan kotak teks. */
  options?: string[];
};

export type Ctx = {
  req: Request;
  sp: URLSearchParams;
  origin: string;
};

export type Endpoint = {
  category: CategoryId;
  slug: string;
  title: string;
  description: string;
  params: Param[];
  kind: "json" | "image" | "video" | "html";
  handler: (ctx: Ctx) => Promise<unknown>;
};

/** Metadata yang aman dikirim ke client (tanpa handler). */
export type EndpointMeta = Omit<Endpoint, "handler"> & { path: string };

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
