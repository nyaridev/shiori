// The Shiori window: a borderless WebView on the local server, with the title bar drawn by the UI.
// In release it starts the server (Node, from the repo this exe sits in) and stops it on exit; if a server is
// already running on the port (start-web.bat), it uses that one. In `tauri dev`, `pnpm dev` runs the servers.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::window::Color;
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

const PORT: u16 = 4400;
const DEV_URL: &str = "http://localhost:4410";

struct Server(Mutex<Option<Child>>);

/// The repo folder: the nearest folder above the exe that has `server/main.ts`.
fn app_root() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    exe.ancestors()
        .find(|dir| dir.join("server").join("main.ts").is_file())
        .map(Path::to_path_buf)
}

fn listening() -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], PORT));
    TcpStream::connect_timeout(&addr, Duration::from_millis(200)).is_ok()
}

fn start_server(root: &Path) -> std::io::Result<Child> {
    let mut cmd = Command::new("node");
    cmd.args([
        "--disable-warning=ExperimentalWarning",
        "server/main.ts",
        "--port",
        &PORT.to_string(),
        "--static",
    ])
    .current_dir(root);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.spawn()
}

fn server_url(app: &tauri::App) -> Result<String, Box<dyn std::error::Error>> {
    if cfg!(debug_assertions) {
        return Ok(DEV_URL.to_string());
    }
    if !listening() {
        let root = app_root().ok_or("Can't find the Shiori folder (server/main.ts) above the exe.")?;
        let child = start_server(&root).map_err(|e| format!("Can't start the server with Node: {e}"))?;
        *app.state::<Server>().0.lock().unwrap() = Some(child);
        let started = Instant::now();
        while !listening() {
            if started.elapsed() > Duration::from_secs(20) {
                return Err("The Shiori server didn't start. Run `pnpm build`, then try again.".into());
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    }
    Ok(format!("http://localhost:{PORT}"))
}

fn main() {
    tauri::Builder::default()
        .manage(Server(Mutex::new(None)))
        .setup(|app| {
            let url = server_url(app)?;
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url.parse()?))
                .title("Shiori")
                .inner_size(1280.0, 820.0)
                .min_inner_size(720.0, 520.0)
                .center()
                .decorations(false)
                .shadow(true)
                .background_color(Color(8, 8, 10, 255))
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Shiori failed to start")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(mut child) = app.state::<Server>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}
