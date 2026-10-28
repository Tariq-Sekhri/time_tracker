import {describeError, logMessage} from "./diagnostics";

/** A busy database after boot must not leave the frontend permanently unmounted. */
export async function retryStartupDatabase(operation: () => Promise<void>): Promise<void> {
    for (let attempt = 1; ; attempt++) {
        try {
            await operation();
            return;
        } catch (error) {
            const transient = /database (?:is )?(?:locked|busy)|pool timed out while waiting for an open connection/i
                .test(describeError(error));
            if (!transient || attempt >= 3) throw error;
            void logMessage("warn", `Startup database busy; retrying attempt=${attempt + 1}`);
            await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        }
    }
}
