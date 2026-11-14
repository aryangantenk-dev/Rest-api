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
  /**
   * Endpoint ini juga menerima berkas lewat POST (multipart/form-data, nama field `field`).
   * Endpoint lain hanya menerima GET. Playground menampilkan pemilih berkas untuknya.
   */
  upload?: Upload;
  handler: (ctx: Ctx) => Promise<unknown>;
};

export type Upload = {
  field: string;
  /** Nilai atribut `accept` untuk pemilih berkas. */
  accept: string;
  maxBytes: number;
  description: string;
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
