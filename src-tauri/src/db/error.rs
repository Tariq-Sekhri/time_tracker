use sqlx;
use thiserror::Error;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Error)]
#[serde(tag = "type", content = "data")]
pub enum AppError {
    #[error("db error: {0}")]
    Db(String),
    #[error("not found")]
    NotFound,
    #[error("{0}")]
    Other(String),
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        match e {
            sqlx::Error::RowNotFound => AppError::NotFound,
            other => AppError::Db(other.to_string()),
        }
    }
}
