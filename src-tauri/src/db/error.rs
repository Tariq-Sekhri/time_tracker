use serde::{Deserialize, Serialize};
use sqlx;
use std::fmt::Formatter;
use std::time::SystemTimeError;
use thiserror::Error;

#[derive(Debug, Serialize, Deserialize, Error, Clone)]
#[serde(tag = "type", content = "data")]
pub enum AppError {
    #[error("db error: {0}")]
    Db(String),
    #[error("not found")]
    NotFound,
    #[error("regex error: {0}")]
    Regex(String),
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

#[derive(Debug)]
pub enum DatabaseError {
    Sqlx(sqlx::Error),
    AppError(AppError),
}

impl std::fmt::Display for DatabaseError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            DatabaseError::Sqlx(e) => write!(f, "Database error: {}", e),
            DatabaseError::AppError(e) => write!(f, "Database error: {}", e),
        }
    }
}

#[derive(Debug)]
pub enum WeekProcessError {
    Database(DatabaseError),
    Regex(regex::Error),
    MissingCategory,
    NoLogs,
    Serialization(serde_json::Error),
}

impl std::fmt::Display for WeekProcessError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            WeekProcessError::Database(e) => write!(f, "Database error: {}", e),
            WeekProcessError::Regex(e) => write!(f, "Regex error: {}", e),
            WeekProcessError::MissingCategory => write!(f, "Missing category"),
            WeekProcessError::NoLogs => write!(f, "No logs found"),
            WeekProcessError::Serialization(e) => write!(f, "Serialization error: {}", e),
        }
    }
}

impl From<sqlx::Error> for WeekProcessError {
    fn from(err: sqlx::Error) -> Self {
        WeekProcessError::Database(DatabaseError::Sqlx(err))
    }
}

impl From<AppError> for WeekProcessError {
    fn from(err: AppError) -> Self {
        WeekProcessError::Database(DatabaseError::AppError(err))
    }
}

impl From<regex::Error> for WeekProcessError {
    fn from(err: regex::Error) -> Self {
        WeekProcessError::Regex(err)
    }
}

impl From<serde_json::Error> for WeekProcessError {
    fn from(err: serde_json::Error) -> Self {
        WeekProcessError::Serialization(err)
    }
}

impl From<WeekProcessError> for String {
    fn from(err: WeekProcessError) -> Self {
        err.to_string()
    }
}

impl From<WeekProcessError> for AppError {
    fn from(err: WeekProcessError) -> Self {
        AppError::Other(err.to_string())
    }
}
