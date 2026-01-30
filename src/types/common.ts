
export type Result<D, E> =
    | { success: true; data: D }
    | { success: false; error: E };

export type AppError =
    | { type: "Db"; data: string }
    | { type: "NotFound" }
    | { type: "Regex"; data: string }
    | { type: "Other"; data: string };

export function getErrorMessage(error: AppError): string {
    switch (error.type) {
        case "Db":
            return error.data;
        case "NotFound":
            return "Not found";
        case "Regex":
            return error.data;
        case "Other":
            return error.data;
    }
}





