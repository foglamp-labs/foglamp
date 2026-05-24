import type * as Contract from "@watchtower/contracts";

import type * as Wire from "./wire";

// Compile-time guarantee that the SDK's plain wire types (src/wire.ts) stay
// structurally identical to the @watchtower/contracts v1 schemas. This file is
// type-only — it emits no runtime code and is NOT part of the published bundle
// (tsdown bundles src/index.ts, which never imports this). It exists solely so
// that a change to the wire contract fails `check-types` here until src/wire.ts
// is updated to match.

type Extends<A, B> = A extends B ? true : false;
type Mutual<A, B> = Extends<A, B> extends true ? Extends<B, A> : false;
type Assert<T extends true> = T;

// If any of these error, src/wire.ts has drifted from the contract.
export type _Metadata = Assert<Mutual<Wire.Metadata, Contract.Metadata>>;
export type _Usage = Assert<Mutual<Wire.Usage, Contract.Usage>>;
export type _SpanType = Assert<Mutual<Wire.SpanType, Contract.SpanType>>;
export type _SpanStatus = Assert<Mutual<Wire.SpanStatus, Contract.SpanStatus>>;
export type _Span = Assert<Mutual<Wire.Span, Contract.Span>>;
export type _Trace = Assert<Mutual<Wire.Trace, Contract.Trace>>;
export type _IngestPayload = Assert<Mutual<Wire.IngestPayload, Contract.IngestPayload>>;
