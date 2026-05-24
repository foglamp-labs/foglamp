import type { Context } from "./context";

// Service-layer aliases for the per-request handles. Services are pure functions
// with the signature (db, ch, log, ...args) — these name the first three.
export type Db = Context["db"];
export type Ch = Context["ch"];
export type Log = Context["log"];
