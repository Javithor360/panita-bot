/**
 * Types of the API responses the bot uses, named as in the OpenAPI document (`panita-api/docs/openapi.yaml`).
 * Dates arrive as ISO strings; services convert them where the bot needs a `Date`.
 */

/** A success body: `{ data }`, plus `meta` on lists. */
export interface ApiEnvelope<T, M = undefined> {
  data: T;
  meta: M;
}

export interface ListMeta {
  count: number;
}

export type ApiClientName = 'web' | 'bot' | 'launcher' | 'mod';

/** `GET /v1/whoami` */
export interface WhoAmI {
  client: ApiClientName;
}
