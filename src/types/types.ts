export type Result<D, E> =
    { success: true, data: D } |
    { success: false, error: E };


export type AppError =
    | { type: "Db"; data: string }
    | { type: "NotFound" }
    | { type: "Other"; data: string };

export type Category = {
    id: number,
    name: string,
    priority: number
}

export type CategoryRegex = {
    id: number,
    cat_id: number,
    regex: string,
}

