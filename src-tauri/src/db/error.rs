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
    fn from(e: anyhow::Error) -> Self {
        Self(e)
    }
}

macro_rules! impl_from {
    ($($t:ty),*) => {
        $(impl From<$t> for Error {
            fn from(e: $t) -> Self {
                Self(e.into())
            }
        })*
    };
}

impl_from!(
    sqlx::Error,
    std::io::Error,
    regex::Error,
    std::time::SystemTimeError,
    AuthExpiredError
);

impl Error {
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
