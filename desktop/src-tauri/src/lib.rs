// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(|app| {
            use tauri::Manager;
            let window = app.get_webview_window("main").expect("no main window");
            window.with_webview(move |webview| {
                #[cfg(windows)]
                {
                    use webview2_com::Microsoft::Web::WebView2::Win32::{
                        ICoreWebView2PermissionRequestedEventArgs,
                        COREWEBVIEW2_PERMISSION_STATE_ALLOW,
                    };

                    unsafe {
                        let core = webview.controller().CoreWebView2().unwrap();
                        let handler = webview2_com::PermissionRequestedEventHandler::create(
                            Box::new(move |_sender, args| {
                                if let Some(args) = args {
                                    args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
                                }
                                Ok(())
                            }),
                        );
                        let mut token: i64 = 0;
                        let _ = core.add_PermissionRequested(&handler, &mut token as *mut i64);
                    }
                }
            }).expect("Failed to configure WebView2 permissions");
            Ok(())
        })
        // Sidecar is spawned from the JS side (App.tsx) which handles full IPC
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
