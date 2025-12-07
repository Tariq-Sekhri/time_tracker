#![cfg_attr(not(feature = "dev-warnings"), allow(dead_code, unused_imports))]

pub mod cat_regex;
pub mod category;
pub mod log;
pub mod error;
pub mod pool;
pub mod queries;

pub use error::AppError;
pub use pool::get_pool;
pub use queries::get_week;
