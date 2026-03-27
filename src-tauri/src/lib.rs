use std::sync::{Arc, Mutex};
use tauri::Manager;
use tauri_plugin_shell::ShellExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let server_dir = find_server_dir();
            let node = which_node();

            println!("[BetOnMe] Starting server from: {}", server_dir.display());
            println!("[BetOnMe] Using node: {}", node);

            let (_rx, child) = app
                .shell()
                .command(&node)
                .args(["server.js"])
                .current_dir(&server_dir)
                .spawn()
                .expect("Failed to spawn server.js");

            println!("[BetOnMe] server.js running (pid: {})", child.pid());

            // Store child in app state so it stays alive and is killed on exit
            app.manage(Arc::new(Mutex::new(Some(child))));

            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running BetOnMe");
}

fn find_server_dir() -> std::path::PathBuf {
    // 1. Installed .deb: /usr/lib/betonme/
    let installed = std::path::PathBuf::from("/usr/lib/betonme");
    if installed.join("server.js").exists() {
        return installed;
    }
    // 2. Walk up from exe to find server.js (dev mode)
    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent().map(|p| p.to_path_buf()).unwrap_or_default();
        for _ in 0..8 {
            if dir.join("server.js").exists() {
                return dir;
            }
            match dir.parent() {
                Some(p) => dir = p.to_path_buf(),
                None => break,
            }
        }
    }
    std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."))
}

fn which_node() -> String {
    // Check nvm versions first
    if let Ok(home) = std::env::var("HOME") {
        let nvm_base = std::path::Path::new(&home).join(".nvm/versions/node");
        if nvm_base.exists() {
            if let Ok(entries) = std::fs::read_dir(&nvm_base) {
                let mut versions: Vec<_> = entries.flatten().collect();
                versions.sort_by_key(|e| e.file_name());
                if let Some(latest) = versions.last() {
                    let node = latest.path().join("bin/node");
                    if node.exists() {
                        return node.to_string_lossy().to_string();
                    }
                }
            }
        }
    }
    for path in &["/usr/bin/node", "/usr/local/bin/node"] {
        if std::path::Path::new(path).exists() {
            return path.to_string();
        }
    }
    "node".to_string()
}
