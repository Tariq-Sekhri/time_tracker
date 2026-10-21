//! Process-level crash evidence the Rust panic hook cannot see: native exceptions
//! (access violations, stack overflows), a liveness heartbeat, and Windows' own crash records.
use crate::logger::Log;
use chrono::{DateTime, FixedOffset, Local};
use std::time::Duration;

const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(5 * 60);

pub fn install() {
    #[cfg(windows)]
    windows_impl::install_exception_filter();
    let started = std::time::Instant::now();
    let spawned = std::thread::Builder::new()
        .name("log-heartbeat".into())
        .spawn(move || {
            let mut previous = Local::now();
            loop {
                std::thread::sleep(HEARTBEAT_INTERVAL);
                let now = Local::now();
                let gap = (now - previous).num_seconds();
                if gap > HEARTBEAT_INTERVAL.as_secs() as i64 + 60 {
                    Log::info(format!("System was suspended or stalled gap_secs={gap}"));
                }
                previous = now;
                Log::info(format!(
                    "Heartbeat uptime_min={} {}",
                    started.elapsed().as_secs() / 60,
                    memory_summary()
                ));
            }
        });
    if let Err(error) = spawned {
        Log::error(format!("Heartbeat thread failed to start: {error}"));
    }
}

/// Wall-clock time Windows last booted; sessions whose final log line predates it ended with the OS.
pub fn boot_time() -> Option<DateTime<Local>> {
    #[cfg(windows)]
    {
        let uptime_ms = unsafe { windows::Win32::System::SystemInformation::GetTickCount64() };
        Some(Local::now() - chrono::Duration::milliseconds(uptime_ms as i64))
    }
    #[cfg(not(windows))]
    {
        None
    }
}

fn memory_summary() -> String {
    #[cfg(windows)]
    {
        windows_impl::memory_summary()
    }
    #[cfg(not(windows))]
    {
        String::new()
    }
}

/// Copy Windows Error Reporting crash/hang entries for this exe since the previous session's last line.
pub fn report_os_crash_records(since: Option<DateTime<FixedOffset>>) {
    #[cfg(windows)]
    {
        let spawned = std::thread::Builder::new()
            .name("crash-records".into())
            .spawn(move || windows_impl::report_os_crash_records(since));
        if let Err(error) = spawned {
            Log::error(format!("Crash record lookup failed to start: {error}"));
        }
    }
    #[cfg(not(windows))]
    let _ = since;
}

#[cfg(windows)]
mod windows_impl {
    use super::*;
    use std::os::windows::process::CommandExt;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::HMODULE;
    use windows::Win32::System::Diagnostics::Debug::{SetUnhandledExceptionFilter, EXCEPTION_POINTERS};
    use windows::Win32::System::LibraryLoader::{
        GetModuleFileNameW, GetModuleHandleExW, GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS,
        GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
    };
    use windows::Win32::System::ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS};
    use windows::Win32::System::Threading::GetCurrentProcess;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    const EXCEPTION_CONTINUE_SEARCH: i32 = 0;

    pub fn install_exception_filter() {
        unsafe {
            SetUnhandledExceptionFilter(Some(unhandled_exception));
        }
    }

    /// Runs on the faulting thread, possibly with only the stack-overflow guarantee left,
    /// so it formats one short line and lets Windows Error Reporting continue.
    unsafe extern "system" fn unhandled_exception(info: *const EXCEPTION_POINTERS) -> i32 {
        let record = info.as_ref().and_then(|info| info.ExceptionRecord.as_ref());
        let (code, address) = record
            .map(|record| (record.ExceptionCode.0 as u32, record.ExceptionAddress as usize))
            .unwrap_or_default();
        let mut module = HMODULE::default();
        let mut name = [0u16; 260];
        let module_name = if GetModuleHandleExW(
            GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
            PCWSTR(address as *const u16),
            &mut module,
        )
        .is_ok()
        {
            let length = GetModuleFileNameW(Some(module), &mut name) as usize;
            String::from_utf16_lossy(&name[..length])
        } else {
            String::from("unknown")
        };
        Log::write_emergency(&format!(
            "Native crash code=0x{code:08X} ({}) thread={} module={module_name} offset=0x{:X}",
            describe(code),
            std::thread::current().name().unwrap_or("unnamed"),
            address.wrapping_sub(module.0 as usize)
        ));
        EXCEPTION_CONTINUE_SEARCH
    }

    fn describe(code: u32) -> &'static str {
        match code {
            0xC000_0005 => "access violation",
            0xC000_00FD => "stack overflow",
            0xC000_0409 => "fail-fast / stack buffer overrun",
            0xC000_001D => "illegal instruction",
            0xC000_0094 => "integer divide by zero",
            0xC000_0374 => "heap corruption",
            0x8000_0003 => "breakpoint",
            _ => "unrecognized",
        }
    }

    pub fn memory_summary() -> String {
        let mut counters = PROCESS_MEMORY_COUNTERS::default();
        let size = std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32;
        match unsafe { GetProcessMemoryInfo(GetCurrentProcess(), &mut counters, size) } {
            Ok(()) => format!(
                "working_set_mb={} peak_working_set_mb={} private_mb={}",
                counters.WorkingSetSize / 1_048_576,
                counters.PeakWorkingSetSize / 1_048_576,
                counters.PagefileUsage / 1_048_576
            ),
            Err(error) => format!("memory_error={error}"),
        }
    }

    pub fn report_os_crash_records(since: Option<DateTime<FixedOffset>>) {
        // Look back from slightly before the last line; default to a day when it was unreadable.
        let window_ms = since
            .map(|since| (Local::now().fixed_offset() - since).num_milliseconds() + 60_000)
            .unwrap_or(86_400_000)
            .max(60_000);
        let query = format!(
            "*[System[(EventID=1000 or EventID=1002) and TimeCreated[timediff(@SystemTime) <= {window_ms}]]]"
        );
        let output = std::process::Command::new("wevtutil")
            .args(["qe", "Application", &format!("/q:{query}"), "/f:text", "/rd:true", "/c:50"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        let output = match output {
            Ok(output) => output,
            Err(error) => return Log::error(format!("Crash record lookup failed: {error}")),
        };
        let text = String::from_utf8_lossy(&output.stdout);
        let exe = std::env::current_exe()
            .ok()
            .and_then(|path| path.file_name().map(|name| name.to_string_lossy().to_lowercase()))
            .unwrap_or_else(|| "time-tracker.exe".into());
        let records: Vec<&str> = text
            .split("Event[")
            .filter(|record| record.to_lowercase().contains(&exe))
            .collect();
        if records.is_empty() {
            Log::info(format!("No Windows crash or hang records for {exe} since previous session"));
        }
        for record in records {
            Log::error(format!("Windows crash record for previous session: {record}"));
        }
    }
}
