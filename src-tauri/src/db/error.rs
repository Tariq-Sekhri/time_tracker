use serde::{Deserialize, Serialize};
use sqlx;
use std::fmt::Formatter;
use std::time::SystemTimeError;
use thiserror::Error;

#[derive(Debug, Serialize, Deserialize, Error, Clone)]
#[serde(tag = "type", content = "data")]
pub enum Error {
    #[error("db error: {0}")]
    Db(String),
    #[error("not found")]
    NotFound,
    #[error("regex error: {0}")]
    Regex(String),
    #[error("{0}")]
    Other(String),
}

impl From<sqlx::Error> for Error {
    fn from(e: sqlx::Error) -> Self {
        match e {
            sqlx::Error::RowNotFound => Error::NotFound,
            other => Error::Db(other.to_string()),
        }
    }
}

impl From<SystemTimeError> for Error {
    fn from(e: SystemTimeError) -> Self {
        Error::Other(e.to_string())
    }
}
