import type { Endpoint, EndpointMeta } from "./types";
import { aiEndpoints } from "./ai";
import { toolsEndpoints } from "./tools";
import { textEndpoints } from "./text";
import { imageEndpoints } from "./image";
import { randomEndpoints } from "./random";
import { islamiEndpoints } from "./islami";
import { infoEndpoints } from "./info";
import { komikEndpoints } from "./komik";
import { animeEndpoints } from "./anime";
import { categories } from "./categories";

export const endpoints: Endpoint[] = [
  ...aiEndpoints,
  ...toolsEndpoints,
  ...textEndpoints,
  ...imageEndpoints,
  ...randomEndpoints,
  ...islamiEndpoints,
  ...infoEndpoints,
  ...komikEndpoints,
  ...animeEndpoints,
];

const index = new Map(endpoints.map((e) => [`${e.category}/${e.slug}`, e]));

export function findEndpoint(key: string): Endpoint | undefined {
  return index.get(key);
}

export function toMeta(e: Endpoint): EndpointMeta {
  return {
    category: e.category,
    slug: e.slug,
    title: e.title,
    description: e.description,
    params: e.params,
    kind: e.kind,
    path: `/api/${e.category}/${e.slug}`,
  };
}

export function allMeta(): EndpointMeta[] {
  const order = new Map(categories.map((c, i) => [c.id, i]));
  return endpoints.map(toMeta).sort((a, b) => (order.get(a.category)! - order.get(b.category)!));
}
