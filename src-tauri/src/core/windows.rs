use std::{ffi::c_void, ptr::null_mut};

use crate::db::Error;
use windows::{
    core::{PCWSTR, PWSTR},
    Win32::{
        Foundation::CloseHandle,
        Storage::FileSystem::{GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW},
        System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
            PROCESS_QUERY_LIMITED_INFORMATION,
        },
        UI::WindowsAndMessaging as ws,
    },
};

pub(crate) fn get_foreground_app() -> Result<String, Error> {
    unsafe {
        let hwnd = ws::GetForegroundWindow();

        let mut buf = [0u16; 1024];
        let n = ws::GetWindowTextW(hwnd, &mut buf).max(0) as usize;
        let title = String::from_utf16_lossy(&buf[..n]);

        let mut pid = 0u32;
        let _ = ws::GetWindowThreadProcessId(hwnd, Some(&mut pid));

        let path = query_process_path(pid).unwrap_or_default();
        let exe_name = path.rsplit('\\').next().unwrap_or(&path);

        let task_manager_name = version_blob(&path)
            .as_ref()
            .and_then(|data| {
                query_version_string(data, "FileDescription")
                    .or_else(|| query_version_string(data, "ProductName"))
            })
            .unwrap_or_else(|| exe_name.to_string());

        Ok(format_window_output(&title, &task_manager_name, exe_name))
    }
}

fn wide_to_string(buf: &[u16]) -> String {
    let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..end])
}

fn to_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn normalize_for_match(s: &str) -> String {
    let lower = s.trim().to_lowercase();
    let without_exe = lower.strip_suffix(".exe").unwrap_or(&lower);

    without_exe
        .split(|c: char| !c.is_alphanumeric())
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

fn title_contains_name(title: &str, name: &str) -> bool {
    let title = format!(" {} ", normalize_for_match(title));
    let name = normalize_for_match(name);

    !name.is_empty() && title.contains(&format!(" {name} "))
}

fn format_window_output(title: &str, task_manager_name: &str, exe_name: &str) -> String {
    let title = title.trim();

    if title.is_empty() {
        return task_manager_name.to_string();
    }

    if title_contains_name(title, task_manager_name) || title_contains_name(title, exe_name) {
        title.to_string()
    } else {
        format!("{title} - {task_manager_name}")
    }
}

unsafe fn query_process_path(pid: u32) -> Option<String> {
    let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;

    let mut buf = [0u16; 2048];
    let mut size = buf.len() as u32;

    QueryFullProcessImageNameW(
        process,
        PROCESS_NAME_FORMAT(0),
        PWSTR(buf.as_mut_ptr()),
        &mut size,
    )
    .ok()?;

    let _ = CloseHandle(process);

    Some(String::from_utf16_lossy(&buf[..size as usize]))
}

unsafe fn version_blob(path: &str) -> Option<Vec<u8>> {
    let path_w = to_wide(path);
    let mut handle = 0u32;

    let size = GetFileVersionInfoSizeW(PCWSTR(path_w.as_ptr()), Some(&mut handle));

    if size == 0 {
        return None;
    }

    let mut data = vec![0u8; size as usize];

    GetFileVersionInfoW(
        PCWSTR(path_w.as_ptr()),
        Some(0),
        size,
        data.as_mut_ptr().cast::<c_void>(),
    )
    .ok()?;

    Some(data)
}

unsafe fn query_version_string(data: &[u8], key: &str) -> Option<String> {
    for lang_code in ["040904b0", "040904e4", "000004b0", "000004e4"] {
        let sub_block = format!("\\StringFileInfo\\{}\\{}", lang_code, key);
        let sub_block_w = to_wide(&sub_block);

        let mut value_ptr: *mut c_void = null_mut();
        let mut value_len = 0u32;

        let ok = VerQueryValueW(
            data.as_ptr().cast::<c_void>(),
            PCWSTR(sub_block_w.as_ptr()),
            &mut value_ptr,
            &mut value_len,
        );

        if ok.as_bool() && !value_ptr.is_null() && value_len > 0 {
            let slice = std::slice::from_raw_parts(value_ptr.cast::<u16>(), value_len as usize);

            let value = wide_to_string(slice);

            if !value.is_empty() {
                return Some(value);
            }
        }
    }

    None
}
