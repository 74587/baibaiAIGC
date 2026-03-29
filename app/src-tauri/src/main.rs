#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::async_runtime::spawn_blocking;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelConfig {
    base_url: String,
    api_key: String,
    model: String,
    temperature: f64,
    offline_mode: bool,
}

fn workspace_root() -> Result<PathBuf, String> {
    let current_dir = std::env::current_dir().map_err(|error| error.to_string())?;
    if current_dir.ends_with("app") {
        current_dir.parent().map(Path::to_path_buf).ok_or_else(|| "Cannot resolve workspace root".to_string())
    } else if current_dir.ends_with(Path::new("app").join("src-tauri")) {
        current_dir
            .parent()
            .and_then(Path::parent)
            .map(Path::to_path_buf)
            .ok_or_else(|| "Cannot resolve workspace root".to_string())
    } else {
        Ok(current_dir)
    }
}

fn script_path(root: &Path, relative_path: &str) -> String {
    root.join(relative_path).to_string_lossy().replace('\\', "\\\\")
}

fn python_executable(root: &Path) -> PathBuf {
    let venv_python = root.join(".venv").join("Scripts").join("python.exe");
    if venv_python.exists() {
        return venv_python;
    }
    PathBuf::from("python")
}

fn run_python_json(args: &[String]) -> Result<String, String> {
    let root = workspace_root()?;
    let python = python_executable(&root);
    let mut command = Command::new(python);
    command.current_dir(&root);
    command.env("PYTHONIOENCODING", "utf-8");
    command.env("PYTHONUTF8", "1");
    command.arg("scripts/app_service.py");
    for arg in args {
        command.arg(arg);
    }
    let output = command.output().map_err(|error| error.to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let message = if !stderr.is_empty() { stderr } else { stdout };
        return Err(if message.is_empty() { "Python command failed".to_string() } else { message });
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn run_python_inline(code: &str) -> Result<String, String> {
    let root = workspace_root()?;
    let python = python_executable(&root);
    let output = Command::new(python)
        .current_dir(&root)
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1")
        .arg("-c")
        .arg(code)
        .output()
        .map_err(|error| error.to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let message = if !stderr.is_empty() { stderr } else { stdout };
        return Err(if message.is_empty() { "Python command failed".to_string() } else { message });
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
async fn load_model_config() -> Result<ModelConfig, String> {
    spawn_blocking(move || {
        let root = workspace_root()?;
        let output = run_python_inline(
            &format!(
                "import json, runpy; module = runpy.run_path(r'{}'); print(json.dumps(module['load_app_config'](), ensure_ascii=False))",
                script_path(&root, "scripts/app_config.py")
            ),
        )?;
        serde_json::from_str(&output).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn save_model_config(config: ModelConfig) -> Result<ModelConfig, String> {
    spawn_blocking(move || {
        let root = workspace_root()?;
        let config_json = serde_json::to_string(&config).map_err(|error| error.to_string())?;
        let output = run_python_inline(&format!(
            "import json, runpy; module = runpy.run_path(r'{}'); print(json.dumps(module['save_app_config'](json.loads(r'''{}''')), ensure_ascii=False))",
            script_path(&root, "scripts/app_config.py"),
            config_json
        ))?;
        serde_json::from_str(&output).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn get_document_status(source_path: String) -> Result<serde_json::Value, String> {
    spawn_blocking(move || {
        let output = run_python_json(&["document-status".to_string(), source_path])?;
        serde_json::from_str(&output).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn get_document_history(source_path: String) -> Result<serde_json::Value, String> {
    spawn_blocking(move || {
        let output = run_python_json(&["document-history".to_string(), source_path])?;
        serde_json::from_str(&output).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn run_aigc_round(source_path: String, model_config: ModelConfig) -> Result<serde_json::Value, String> {
    spawn_blocking(move || {
        let config_json = serde_json::to_string(&model_config).map_err(|error| error.to_string())?;
        let output = run_python_json(&[
            "run-round".to_string(),
            source_path,
            config_json,
        ])?;
        serde_json::from_str(&output).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn read_output_text(output_path: String) -> Result<serde_json::Value, String> {
    spawn_blocking(move || {
        let output = run_python_json(&["read-output".to_string(), output_path])?;
        serde_json::from_str(&output).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn export_round_output(output_path: String, export_path: String, target_format: String) -> Result<serde_json::Value, String> {
    spawn_blocking(move || {
        let output = run_python_json(&[
            "export-round".to_string(),
            output_path,
            export_path,
            target_format,
        ])?;
        serde_json::from_str(&output).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            load_model_config,
            save_model_config,
            get_document_status,
            get_document_history,
            run_aigc_round,
            read_output_text,
            export_round_output,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
