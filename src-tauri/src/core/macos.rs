use core_foundation::{
    array::CFArray,
    base::{CFType, TCFType},
    dictionary::CFDictionary,
    number::CFNumber,
    string::{CFString, CFStringRef},
};
use core_graphics::window::{
    copy_window_info, kCGNullWindowID, kCGWindowLayer, kCGWindowListExcludeDesktopElements,
    kCGWindowListOptionOnScreenOnly, kCGWindowName, kCGWindowOwnerPID,
};
use objc2_app_kit::NSWorkspace;

use crate::db::Error;

pub(crate) fn get_foreground_app() -> Result<String, Error> {
    let workspace = unsafe { NSWorkspace::sharedWorkspace() };
    let application = unsafe { workspace.frontmostApplication() }.ok_or_else(|| {
        Error(anyhow::anyhow!(
            "macOS did not report a frontmost application"
        ))
    })?;

    let pid = unsafe { application.processIdentifier() } as i64;
    let application_name = unsafe { application.localizedName() }
        .map(|name| name.to_string())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| format!("Process {pid}"));

    let window_title = frontmost_window_title(pid);
    Ok(format_window_output(
        window_title.as_deref(),
        &application_name,
    ))
}

fn frontmost_window_title(pid: i64) -> Option<String> {
    let raw_windows = copy_window_info(
        kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
        kCGNullWindowID,
    )?;

    // CGWindowListCopyWindowInfo returns an array of window dictionaries ordered
    // from front to back. Give the untyped array its documented concrete type.
    let windows: CFArray<CFDictionary<CFString, CFType>> =
        unsafe { TCFType::wrap_under_get_rule(raw_windows.as_concrete_TypeRef()) };

    windows
        .iter()
        .filter(|window| number_value(window, unsafe { kCGWindowOwnerPID }) == Some(pid))
        .filter(|window| number_value(window, unsafe { kCGWindowLayer }) == Some(0))
        .find_map(|window| {
            string_value(&window, unsafe { kCGWindowName }).filter(|title| !title.trim().is_empty())
        })
}

fn number_value(dictionary: &CFDictionary<CFString, CFType>, key_ref: CFStringRef) -> Option<i64> {
    let key = unsafe { CFString::wrap_under_get_rule(key_ref) };
    let value = dictionary.find(&key)?;
    let value = unsafe { CFType::wrap_under_get_rule(value.as_CFTypeRef()) };

    value.downcast::<CFNumber>()?.to_i64()
}

fn string_value(
    dictionary: &CFDictionary<CFString, CFType>,
    key_ref: CFStringRef,
) -> Option<String> {
    let key = unsafe { CFString::wrap_under_get_rule(key_ref) };
    let value = dictionary.find(&key)?;
    let value = unsafe { CFType::wrap_under_get_rule(value.as_CFTypeRef()) };

    value.downcast::<CFString>().map(|value| value.to_string())
}

fn format_window_output(window_title: Option<&str>, application_name: &str) -> String {
    let Some(window_title) = window_title
        .map(str::trim)
        .filter(|title| !title.is_empty())
    else {
        return application_name.to_string();
    };

    if window_title
        .to_lowercase()
        .contains(&application_name.to_lowercase())
    {
        window_title.to_string()
    } else {
        format!("{window_title} - {application_name}")
    }
}

#[cfg(test)]
mod tests {
    use super::format_window_output;

    #[test]
    fn combines_window_and_application_names() {
        assert_eq!(
            format_window_output(Some("Project"), "Code"),
            "Project - Code"
        );
        assert_eq!(
            format_window_output(Some("Project - Code"), "Code"),
            "Project - Code"
        );
        assert_eq!(format_window_output(None, "Finder"), "Finder");
    }
}
