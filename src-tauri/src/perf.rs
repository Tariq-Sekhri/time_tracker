//! Stage timing for heavy commands. One `PERF` line per call lands in the support log,
//! written on drop so early `?` returns still report how far the command got.
use serde::Serialize;
use std::fmt::{Display, Write};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Instant;

/// Perf spans currently open; recorded at start so parallel calls (e.g. the trend
/// tab firing one stats query per week) show up as contention.
static IN_FLIGHT: AtomicUsize = AtomicUsize::new(0);

pub struct Perf {
    name: &'static str,
    start: Instant,
    last: Instant,
    parts: String,
    finished: bool,
}

impl Perf {
    pub fn new(name: &'static str) -> Self {
        let concurrent = IN_FLIGHT.fetch_add(1, Ordering::Relaxed);
        let now = Instant::now();
        let mut perf = Self {
            name,
            start: now,
            last: now,
            parts: String::new(),
            finished: false,
        };
        perf.note("concurrent", concurrent);
        perf
    }

    /// Record time elapsed since the previous stage (or start) under `label`.
    pub fn stage(&mut self, label: &str) {
        let now = Instant::now();
        let ms = now.duration_since(self.last).as_secs_f64() * 1000.0;
        let _ = write!(self.parts, " {label}={ms:.1}ms");
        self.last = now;
    }

    /// Attach a count or other context value (row counts, etc.).
    pub fn note(&mut self, key: &str, value: impl Display) {
        let _ = write!(self.parts, " {key}={value}");
    }

    /// Mark the command as completed; anything dropped without this is logged as aborted.
    pub fn done(&mut self) {
        self.finished = true;
    }
}

impl Drop for Perf {
    fn drop(&mut self) {
        IN_FLIGHT.fetch_sub(1, Ordering::Relaxed);
        let total = self.start.elapsed().as_secs_f64() * 1000.0;
        let status = if self.finished { "" } else { " status=aborted" };
        crate::logger::Log::info(format!(
            "PERF {} total={total:.1}ms{}{status}",
            self.name, self.parts
        ));
    }
}

/// Serialize `value` once to log how big the IPC response is and what JSON encoding costs.
/// This is extra work on top of Tauri's own serialization; it's diagnostics only.
pub fn payload_probe<T: Serialize>(name: &'static str, value: &T) {
    let mut perf = Perf::new(name);
    match serde_json::to_vec(value) {
        Ok(bytes) => {
            perf.stage("serialize");
            perf.note("bytes", bytes.len());
            perf.done();
        }
        Err(error) => perf.note("error", error),
    }
}
