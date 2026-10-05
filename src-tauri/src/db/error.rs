use serde::Serialize;

#[derive(Debug)]
pub struct Error(pub anyhow::Error);

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:#}", self.0)
    }
}

impl Serialize for Error {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&format!("{:#}", self.0))
    }
}

impl From<anyhow::Error> for Error {
    #[track_caller]
    fn from(e: anyhow::Error) -> Self {
        Self::new(e)
    }
}

macro_rules! impl_from {
    ($($t:ty),*) => {
        $(impl From<$t> for Error {
            #[track_caller]
            fn from(e: $t) -> Self {
                Self::new(e.into())
            }
        })*
    };
}

impl_from!(
    sqlx::Error,
    reqwest::Error,
    std::io::Error,
    regex::Error,
    std::time::SystemTimeError,
    AuthExpiredError
);

impl Error {
    #[track_caller]
    pub fn new(error: anyhow::Error) -> Self {
        let caller = std::panic::Location::caller();
        crate::logger::Log::error(format!(
            "Backend error at {}:{}: {error:#}",
            caller.file(),
            caller.line()
        ));
        Self(error)
    }
    pub fn is_auth_expired(&self) -> bool {
        self.0.downcast_ref::<AuthExpiredError>().is_some()
    }
}

#[derive(Debug)]
pub struct AuthExpiredError(pub String);

impl std::fmt::Display for AuthExpiredError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "auth expired: {}", self.0)
    }
}

impl std::error::Error for AuthExpiredError {}
