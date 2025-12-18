// Common utility types used throughout the application

export type Result<D, E> =
    | { success: true; data: D }
    | { success: false; error: E };

export type AppError =
    | { type: "Db"; data: string }
    | { type: "NotFound" }
    | { type: "Other"; data: string };





