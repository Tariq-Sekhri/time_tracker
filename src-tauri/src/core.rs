use crate::db::{self,log::{self, increase_duration, NewLog}};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use windows::Win32::UI::WindowsAndMessaging as ws;

fn generate_log() ->NewLog{
    let hwnd = unsafe{ ws::GetForegroundWindow()};


    let mut buf: [u16; 1024] = [0; 1024];
    let n = unsafe { ws::GetWindowTextW(hwnd, &mut buf) };
    let fore_ground_window = String::from_utf16_lossy(&buf[..n as usize]);
    let now = SystemTime::now();

    // println!("{}", fore_ground_window);
    // println!("{}", now.duration_since(UNIX_EPOCH).unwrap().as_secs());
    NewLog{app:fore_ground_window, timestamp:now.duration_since(UNIX_EPOCH).unwrap().as_secs() as i64}
}



pub async fn background_process(){
    let pool = match db::get_pool().await {
        Ok(pool)=>pool,
        Err(e)=>{eprintln!("Error: {e}"); return}
    };
    let mut last_log_id  = -1;
    loop{
        let new_log = generate_log();
        if last_log_id==-1{
            last_log_id = log::insert(pool, new_log ).await.expect("TODO: panic message");
        }else{
            match log::get_by_id(pool,last_log_id).await {
                Ok(last_log)=>{
                    if last_log.app== new_log.app {
                        increase_duration(pool, last_log.id).await.expect("increase");
                    }else{
                        last_log_id =  log::insert(pool, new_log ).await.expect("last_log");
                    }
                },
                Err(e)=> {eprintln!("Error getting log {e}"); return}
            };

        }

        tokio::time::sleep(Duration::from_secs(1)).await;
    }



}

