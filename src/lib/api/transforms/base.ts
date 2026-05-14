/**
 * Base class for every domain `*TransformError`. Each transform file defines its own
 * `*TransformErrorCode` union and a one-liner subclass:
 *
 *   export type TripTransformErrorCode = 'MISSING_ID' | 'MISSING_FROM_CITY' | …;
 *   export class TripTransformError extends ApiTransformError<TripTransformErrorCode> {}
 *
 * Subclasses inherit the `(message, code, context)` constructor and the `.code` / `.context`
 * fields. `this.name` resolves to the subclass name via `new.target`, so `error.name` and
 * `instanceof` continue to discriminate by domain — the existing transform tests keep passing
 * unchanged.
 */
export class ApiTransformError<TCode extends string = string> extends Error {
  constructor(message: string, public code: TCode, public context: Record<string, unknown> = {}) {
    super(message);
    this.name = new.target.name;
  }
}
