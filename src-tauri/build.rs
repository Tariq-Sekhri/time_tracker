fn main() {
    // Fail the build if test-db feature is enabled in release mode
    #[cfg(all(feature = "test-db", not(debug_assertions)))]
    {
        panic!(
            "\n\n\
            ⚠️  BUILD ERROR: test-db feature is enabled in release mode!\n\
            \n\
            The test-db feature should only be used for development/testing.\n\
            Please disable it before building for production:\n\
            \n\
            Remove '--features test-db' from your build command, or\n\
            remove 'test-db' from [features] in Cargo.toml if it's default.\n\
            \n"
        );
    }
    
    tauri_build::build()
}
