use tauri::Manager;
use tauri_plugin_shell::ShellExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Try to spawn server.js — find it via resource path first, then walk up
            let server_dir = find_server_dir(app.handle());
            let node = which_node();

            match &server_dir {
                Some(dir) => {
                    println!("[BetOnMe] Starting server from: {}", dir.display());
                    println!("[BetOnMe] Using node: {}", node);

                    let spawn_result: Result<_, _> = app
                        .shell()
                        .command(&node)
                        .args(["server.js"])
                        .current_dir(dir)
                        .spawn();
                    match spawn_result {
                        Ok((_rx, child)) => {
                            let pid = child.pid();
                            println!("[BetOnMe] server.js running (pid: {})", pid);
                            app.manage(std::sync::Arc::new(std::sync::Mutex::new(Some(child))));
                        }
                        Err(e) => {
                            eprintln!("[BetOnMe] Failed to spawn server.js: {e}");
                            eprintln!("[BetOnMe] Falling back to externally-running server on port 3001");
                        }
                    }
                }
                None => {
                    eprintln!("[BetOnMe] server.js not found — relying on external server on port 3001");
                    eprintln!("[BetOnMe] Run: systemctl --user start betonme-server  OR  node server.js");
                }
            }

            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running BetOnMe");
}

fn find_server_dir(handle: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    // 1. Tauri resource path (works for bundled .deb / AppImage)
    if let Ok(resource) = handle.path().resource_dir() {
        let candidate = resource.join("server.js");
        if candidate.exists() {
            return Some(resource);
        }
    }

    // 2. /usr/lib/betonme/ (legacy deb install path)
    let installed = std::path::PathBuf::from("/usr/lib/betonme");
    if installed.join("server.js").exists() {
        return Some(installed);
    }

    // 3. /usr/share/betonme/ (recommended deb install path)
    let share = std::path::PathBuf::from("/usr/share/betonme");
    if share.join("server.js").exists() {
        return Some(share);
    }

    // 4. Walk up from the executable (dev mode)
    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent().map(|p| p.to_path_buf()).unwrap_or_default();
        for _ in 0..10 {
            if dir.join("server.js").exists() {
                return Some(dir);
            }
            match dir.parent() {
                Some(p) => dir = p.to_path_buf(),
                None => break,
            }
        }
    }

    // 5. Current working directory
    if let Ok(cwd) = std::env::current_dir() {
        if cwd.join("server.js").exists() {
            return Some(cwd);
        }
    }

    None
}

fn which_node() -> String {
    // 1. nvm — check latest installed version
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

    // 2. Standard system paths
    for path in &[
        "/usr/bin/node",
        "/usr/local/bin/node",
        "/home/linuxbrew/.linuxbrew/bin/node",
    ] {
        if std::path::Path::new(path).exists() {
            return path.to_string();
        }
    }

    // 3. Fall back to PATH lookup
    "node".to_string()
}
