use anyhow::{anyhow, Context, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use minisign_verify::{PublicKey, Signature};
use reqwest::{Method, Response};
use serde::{Deserialize, Serialize};
use std::{
    net::{Ipv4Addr, SocketAddrV4, UdpSocket},
    path::{Path, PathBuf},
    process::Stdio,
    sync::OnceLock,
    time::Duration,
};
use tauri::AppHandle;
use tokio::{fs, sync::Mutex};

use crate::db::Error;

const VERSION: &str = "0.2.0";
const DOWNLOAD_ROOT: &str =
    "https://github.com/Tariq-Sekhri/Time-Tracker-Backend/releases/download";
const MAX_BINARY_SIZE: u64 = 64 * 1024 * 1024;
const DEFAULT_PORT: u16 = 8765;
static CONTROL: Mutex<()> = Mutex::const_new(());
static LOCAL_HTTP: OnceLock<reqwest::Client> = OnceLock::new();

#[derive(Deserialize, Serialize)]
struct Config {
    token: String,
    address: Ipv4Addr,
    port: u16,
}

#[derive(Deserialize)]
struct Ready {
    admin_port: u16,
}

#[derive(Serialize)]
pub struct Status {
    supported: bool,
    firewall_supported: bool,
    installed: bool,
    running: bool,
    address: Option<String>,
    local_address: Option<String>,
    suggested_ip: Option<Ipv4Addr>,
    bind_ip: Option<Ipv4Addr>,
    port: u16,
}

fn root() -> PathBuf {
    crate::instance::data_dir().join("sync-server")
}

fn distribution() -> Option<(&'static str, &'static str)> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => Some(("windows-x64", ".exe")),
        ("linux", "x86_64") => Some(("linux-x64", "")),
        _ => None,
    }
}

fn asset_name() -> Result<String> {
    let (platform, extension) = distribution()
        .ok_or_else(|| anyhow!("Sync server installation is unavailable on this platform"))?;
    Ok(format!(
        "time-tracker-backend-{VERSION}-{platform}{extension}"
    ))
}

fn executable() -> Result<PathBuf> {
    Ok(root().join("program").join(asset_name()?))
}

fn signature_path(executable: &Path) -> PathBuf {
    let mut path = executable.as_os_str().to_owned();
    path.push(".sig");
    path.into()
}

fn suggested_ip() -> Option<Ipv4Addr> {
    let socket = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)).ok()?;
    socket
        .connect(SocketAddrV4::new(Ipv4Addr::new(224, 0, 0, 251), 5353))
        .ok()?;
    match socket.local_addr().ok()?.ip() {
        std::net::IpAddr::V4(ip) if ip.is_private() => Some(ip),
        _ => None,
    }
}

fn configuration() -> Result<Option<Config>> {
    match std::fs::read(root().join("managed.json")) {
        Ok(bytes) => Ok(Some(serde_json::from_slice(&bytes)?)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

fn public_key(app: &AppHandle) -> Result<PublicKey> {
    let key = app
        .config()
        .plugins
        .0
        .get("updater")
        .and_then(|value| value.get("pubkey"))
        .and_then(serde_json::Value::as_str)
        .context("Missing sync server verification key")?;
    Ok(PublicKey::decode(std::str::from_utf8(
        &STANDARD.decode(key)?,
    )?)?)
}

fn verify(app: &AppHandle, bytes: &[u8], signature: &[u8]) -> Result<()> {
    let signature = Signature::decode(std::str::from_utf8(&STANDARD.decode(signature)?)?)?;
    let asset = asset_name()?;
    anyhow::ensure!(
        signature
            .trusted_comment()
            .split_ascii_whitespace()
            .any(|field| field.strip_prefix("file:") == Some(asset.as_str())),
        "The signed server package has an unexpected filename"
    );
    public_key(app)?.verify(bytes, &signature, false)?;
    Ok(())
}

async fn download(client: &reqwest::Client, url: &str, limit: u64) -> Result<Vec<u8>> {
    let mut response = client.get(url).send().await?.error_for_status()?;
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        anyhow::ensure!(
            bytes.len() as u64 + chunk.len() as u64 <= limit,
            "Server download exceeded the size limit"
        );
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

async fn install(app: &AppHandle) -> Result<()> {
    let executable = executable()?;
    let sig_path = signature_path(&executable);
    let client = reqwest::Client::builder()
        .https_only(true)
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(120))
        .build()?;
    let url = format!("{DOWNLOAD_ROOT}/v{VERSION}/{}", asset_name()?);
    let (bytes, signature) = tokio::try_join!(download(&client, &url, MAX_BINARY_SIZE), async {
        download(&client, &format!("{url}.sig"), 8192).await
    },)
    .context("Couldn't download the Time Tracker server package")?;
    verify(app, &bytes, &signature).context("Couldn't verify the server package signature")?;
    fs::create_dir_all(executable.parent().context("Missing install directory")?).await?;
    write_atomic(&sig_path, &signature).await?;
    write_atomic(&executable, &bytes).await?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o700)).await?;
    }
    Ok(())
}

async fn write_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    let temporary = path.with_extension("pending");
    let mut options = fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    options.mode(0o600);
    use tokio::io::AsyncWriteExt;
    let mut file = options.open(&temporary).await?;
    file.write_all(bytes).await?;
    file.sync_all().await?;
    drop(file);
    fs::rename(temporary, path).await?;
    Ok(())
}

fn local_http() -> &'static reqwest::Client {
    LOCAL_HTTP.get_or_init(|| {
        reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(2))
            .timeout(Duration::from_secs(30))
            .build()
            .expect("valid local HTTP client")
    })
}

async fn call(
    config: &Config,
    method: Method,
    path: &str,
    body: Option<serde_json::Value>,
) -> Result<Response> {
    let ready: Ready = serde_json::from_slice(&fs::read(root().join("ready.json")).await?)
        .context("The sync server is starting")?;
    let mut request = local_http()
        .request(
            method,
            format!("http://127.0.0.1:{}/{path}", ready.admin_port),
        )
        .bearer_auth(&config.token);
    if let Some(body) = body {
        request = request.json(&body);
    }
    Ok(request.send().await?.error_for_status()?)
}

async fn running(config: &Config) -> bool {
    call(config, Method::GET, "health", None).await.is_ok()
}

async fn state() -> Result<Status> {
    let config = configuration()?;
    let installed = config.is_some();
    let running = match &config {
        Some(config) if installed => running(config).await,
        _ => false,
    };
    let port = config.as_ref().map_or(DEFAULT_PORT, |config| config.port);
    Ok(Status {
        supported: distribution().is_some(),
        firewall_supported: cfg!(windows),
        installed,
        running,
        address: config
            .as_ref()
            .map(|config| format!("http://{}:{port}", config.address)),
        local_address: installed.then(|| format!("http://127.0.0.1:{port}")),
        suggested_ip: suggested_ip(),
        bind_ip: config.map(|config| config.address),
        port,
    })
}

fn enabled_file() -> PathBuf {
    root().join("start-with-desktop")
}

async fn start(app: &AppHandle, config: &Config) -> Result<()> {
    if running(config).await {
        return Ok(());
    }
    let executable = executable()?;
    let signature_file = signature_path(&executable);
    let installed = async {
        let bytes = fs::read(&executable).await?;
        let signature = fs::read(&signature_file).await?;
        verify(app, &bytes, &signature)
    }
    .await;
    if installed.is_err() {
        install(app).await?;
    }
    match fs::remove_file(root().join("ready.json")).await {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }
    let output = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(root().join("startup.log"))?;
    let mut command = tokio::process::Command::new(executable);
    command
        .arg("--managed")
        .current_dir(root())
        .stdin(Stdio::null())
        .stdout(output.try_clone()?)
        .stderr(output);
    #[cfg(windows)]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    let mut child = command.spawn()?;
    for _ in 0..80 {
        if let Some(status) = child.try_wait()? {
            anyhow::bail!("Sync server exited ({status}). Check that the selected address is available and port {} is free.", config.port);
        }
        if running(config).await {
            tokio::spawn(async move {
                let _ = child.wait().await;
            });
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(125)).await;
    }
    child.kill().await?;
    anyhow::bail!("The sync server didn't start in time");
}

pub async fn restore(app: AppHandle) {
    if !crate::instance::SYNC_ENABLED || !enabled_file().is_file() {
        return;
    }
    let _guard = CONTROL.lock().await;
    let result = async {
        if let Some(config) = configuration()? {
            start(&app, &config).await?;
        }
        Ok::<(), anyhow::Error>(())
    }
    .await;
    if let Err(error) = result {
        crate::logger::Log::warn(format!("Sync server startup failed: {error}"));
    }
}

fn ensure_enabled() -> Result<()> {
    anyhow::ensure!(
        crate::instance::SYNC_ENABLED,
        "Hosting is disabled in development mode"
    );
    Ok(())
}

#[tauri::command]
pub async fn managed_server_status() -> Result<Status, Error> {
    ensure_enabled()?;
    Ok(state().await?)
}

#[tauri::command]
pub async fn managed_server_setup(
    app: AppHandle,
    address: Ipv4Addr,
    port: u16,
) -> Result<Status, Error> {
    ensure_enabled()?;
    let _guard = CONTROL.lock().await;
    let [first, second, _, _] = address.octets();
    let overlay_address = first == 100 && (64..=127).contains(&second);
    if port == 0 || !(address.is_loopback() || address.is_private() || overlay_address) {
        return Err(anyhow!(
            "Choose a local, private-network, or VPN IPv4 address and a valid port"
        )
        .into());
    }
    let existing = configuration()?;
    if let Some(config) = &existing {
        if running(config).await {
            return Err(anyhow!("Stop the sync server before changing its address").into());
        }
    }
    fs::create_dir_all(root())
        .await
        .map_err(anyhow::Error::from)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(root(), std::fs::Permissions::from_mode(0o700))
            .await
            .map_err(anyhow::Error::from)?;
    }
    let executable = executable()?;
    if !executable.is_file() || !signature_path(&executable).is_file() {
        install(&app).await?;
    }
    let token = existing.map(|config| config.token).unwrap_or_else(|| {
        format!(
            "{}{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        )
    });
    let config = Config {
        token,
        address,
        port,
    };
    write_atomic(
        &root().join("managed.json"),
        &serde_json::to_vec(&config).map_err(anyhow::Error::from)?,
    )
    .await?;
    start(&app, &config).await?;
    write_atomic(&enabled_file(), b"").await?;
    Ok(state().await?)
}

#[tauri::command]
pub async fn managed_server_running(app: AppHandle, enabled: bool) -> Result<Status, Error> {
    ensure_enabled()?;
    let _guard = CONTROL.lock().await;
    let config = configuration()?.context("Set up a sync server first")?;
    if enabled {
        start(&app, &config).await?;
        write_atomic(&enabled_file(), b"").await?;
    } else {
        if running(&config).await {
            call(&config, Method::POST, "stop", None).await?;
        }
        match fs::remove_file(enabled_file()).await {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(anyhow::Error::from(error).into()),
        }
        for _ in 0..40 {
            if !running(&config).await {
                break;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    }
    Ok(state().await?)
}

#[derive(Deserialize, Serialize)]
pub struct ManagedDevice {
    uuid: String,
    name: String,
    is_active: bool,
    role: String,
}

#[tauri::command]
pub async fn managed_server_devices() -> Result<Vec<ManagedDevice>, Error> {
    ensure_enabled()?;
    let config = configuration()?.context("Set up a sync server first")?;
    let response = call(&config, Method::GET, "devices", None).await?;
    Ok(response.json().await?)
}

#[tauri::command]
pub async fn managed_server_approve(uuid: uuid::Uuid, active: bool) -> Result<(), Error> {
    ensure_enabled()?;
    let config = configuration()?.context("Set up a sync server first")?;
    call(
        &config,
        Method::POST,
        &format!("devices/{uuid}"),
        Some(serde_json::json!({ "active": active })),
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn managed_server_backup() -> Result<String, Error> {
    ensure_enabled()?;
    let config = configuration()?.context("Set up a sync server first")?;
    let response = call(&config, Method::POST, "backup", None).await?;
    let name: String = response.json().await?;
    Ok(root()
        .join("backups")
        .join(name)
        .to_string_lossy()
        .into_owned())
}

#[cfg(windows)]
#[tauri::command]
pub async fn managed_server_allow_lan() -> Result<(), Error> {
    ensure_enabled()?;
    let _guard = CONTROL.lock().await;
    let config = configuration()?.context("Set up a sync server first")?;
    if !config.address.is_private() || !executable()?.is_file() {
        return Err(
            anyhow!("Select this computer's private Wi-Fi or Ethernet address first").into(),
        );
    }
    fn encoded(command: &str) -> String {
        STANDARD.encode(
            command
                .encode_utf16()
                .flat_map(u16::to_le_bytes)
                .collect::<Vec<_>>(),
        )
    }
    let executable = executable()?.to_string_lossy().replace('\'', "''");
    use std::hash::{Hash, Hasher};
    let mut identity = std::collections::hash_map::DefaultHasher::new();
    root().hash(&mut identity);
    let rule = format!("TimeTrackerSyncServer-{:016x}", identity.finish());
    let inner = encoded(&format!(
        "$ErrorActionPreference='Stop'; \
         $rule='{}'; \
         if (Get-NetFirewallRule -Name $rule -ErrorAction SilentlyContinue) {{ Remove-NetFirewallRule -Name $rule }}; \
         New-NetFirewallRule -Name $rule -DisplayName 'Time Tracker Sync Server' -Direction Inbound \
         -Action Allow -Profile Private -Protocol TCP -Program '{}' -LocalAddress '{}' -LocalPort {} \
         -RemoteAddress LocalSubnet | Out-Null",
        rule, executable, config.address, config.port
    ));
    let launcher = encoded(&format!(
        "$ErrorActionPreference='Stop'; \
         $process=Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -Verb RunAs \
         -WindowStyle Hidden -PassThru -Wait -ArgumentList '-NoProfile -NonInteractive -EncodedCommand {inner}'; \
         exit $process.ExitCode"
    ));
    let status = tokio::process::Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-EncodedCommand",
            &launcher,
        ])
        .creation_flags(0x08000000)
        .status()
        .await?;
    if !status.success() {
        return Err(anyhow!("Windows did not allow the sync server through the firewall").into());
    }
    Ok(())
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn managed_server_allow_lan() -> Result<(), Error> {
    Err(anyhow!("Configure your operating system's firewall for the sync server").into())
}
