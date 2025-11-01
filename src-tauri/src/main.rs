#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![cfg_attr(not(feature = "dev-warnings"), allow(dead_code, unused_imports))]

fn main() {
    time_tracker_lib::run()
}