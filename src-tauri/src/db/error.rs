use serde::{Deserialize, Serialize};
use sqlx;
use std::time::SystemTimeError;
use thiserror::Error;

#[derive(Debug, Serialize, Deserialize, Error, Clone)]
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

impl From<SystemTimeError> for AppError {
    fn from(e: SystemTimeError) -> Self {
        AppError::Other(e.to_string())
    }
}
