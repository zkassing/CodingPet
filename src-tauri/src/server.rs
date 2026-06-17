use serde::{Deserialize, Serialize};
use std::{
    fs,
    net::{Ipv4Addr, SocketAddr},
    path::PathBuf,
};
use tauri::{AppHandle, Emitter};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
};

const CLAWD_SERVER_ID: &str = "clawd-on-desk";
const CLAWD_SERVER_HEADER: &str = "x-clawd-server";
const DEFAULT_SERVER_PORT: u16 = 23333;
const SERVER_PORT_COUNT: u16 = 5;
const MAX_STATE_BODY_BYTES: usize = 4096;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct StatePayload {
    pub state: String,
    pub session_id: Option<String>,
    pub event: Option<String>,
    pub tool_name: Option<String>,
    pub cwd: Option<String>,
    pub session_title: Option<String>,
}

pub fn spawn_state_server(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = run_state_server(app).await {
            eprintln!("Clawd state server failed: {error}");
        }
    });
}

async fn run_state_server(app: AppHandle) -> Result<(), String> {
    let (listener, port) = bind_first_available_port().await?;
    write_runtime_config(port);
    println!("Clawd state server listening on 127.0.0.1:{port}");

    loop {
        let (stream, _) = listener.accept().await.map_err(|err| err.to_string())?;
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(error) = handle_connection(stream, app, port).await {
                eprintln!("Clawd state request failed: {error}");
            }
        });
    }
}

async fn bind_first_available_port() -> Result<(TcpListener, u16), String> {
    for port in DEFAULT_SERVER_PORT..(DEFAULT_SERVER_PORT + SERVER_PORT_COUNT) {
        let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
        match TcpListener::bind(addr).await {
            Ok(listener) => return Ok((listener, port)),
            Err(_) => continue,
        }
    }
    Err("no available Clawd state server port".into())
}

async fn handle_connection(mut stream: TcpStream, app: AppHandle, port: u16) -> Result<(), String> {
    let mut buffer = vec![0_u8; 8192];
    let read = stream.read(&mut buffer).await.map_err(|err| err.to_string())?;
    if read == 0 {
        return Ok(());
    }

    let request = String::from_utf8_lossy(&buffer[..read]);
    let (head, body) = split_http_request(&request);
    let mut lines = head.lines();
    let request_line = lines.next().unwrap_or_default();
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let path = parts.next().unwrap_or_default();

    match (method, path) {
        ("GET", "/state") => send_health_response(&mut stream, port).await,
        ("POST", "/state") => handle_state_post(&mut stream, app, head, body).await,
        _ => write_response(&mut stream, 404, "text/plain", "not found").await,
    }
}

async fn handle_state_post(
    stream: &mut TcpStream,
    app: AppHandle,
    head: &str,
    initial_body: &str,
) -> Result<(), String> {
    let content_length = parse_content_length(head).unwrap_or(initial_body.len());
    if content_length > MAX_STATE_BODY_BYTES {
        return write_response(stream, 413, "text/plain", "state payload too large").await;
    }

    let body = initial_body.as_bytes();
    if body.len() < content_length {
        return write_response(stream, 400, "text/plain", "incomplete body").await;
    }

    let payload: StatePayload = match serde_json::from_slice(&body[..content_length]) {
        Ok(payload) => payload,
        Err(_) => return write_response(stream, 400, "text/plain", "bad json").await,
    };

    if !is_valid_state(&payload.state) {
        return write_response(stream, 400, "text/plain", "unknown state").await;
    }

    let _ = app.emit("clawd-state-change", payload);
    write_response(stream, 200, "text/plain", "ok").await
}

async fn send_health_response(stream: &mut TcpStream, port: u16) -> Result<(), String> {
    let body = serde_json::json!({ "ok": true, "app": CLAWD_SERVER_ID, "port": port }).to_string();
    write_response(stream, 200, "application/json", &body).await
}

async fn write_response(
    stream: &mut TcpStream,
    status: u16,
    content_type: &str,
    body: &str,
) -> Result<(), String> {
    let reason = match status {
        200 => "OK",
        400 => "Bad Request",
        404 => "Not Found",
        413 => "Payload Too Large",
        _ => "OK",
    };
    let response = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\n{CLAWD_SERVER_HEADER}: {CLAWD_SERVER_ID}\r\nConnection: close\r\n\r\n{body}",
        body.as_bytes().len()
    );
    stream
        .write_all(response.as_bytes())
        .await
        .map_err(|err| err.to_string())
}

fn split_http_request(request: &str) -> (&str, &str) {
    request
        .split_once("\r\n\r\n")
        .unwrap_or((request, ""))
}

fn parse_content_length(head: &str) -> Option<usize> {
    head.lines().find_map(|line| {
        let (name, value) = line.split_once(':')?;
        if name.eq_ignore_ascii_case("content-length") {
            value.trim().parse().ok()
        } else {
            None
        }
    })
}

fn is_valid_state(state: &str) -> bool {
    matches!(
        state,
        "idle"
            | "thinking"
            | "working"
            | "juggling"
            | "sweeping"
            | "error"
            | "attention"
            | "notification"
            | "carrying"
            | "sleeping"
            | "waking"
    )
}

fn write_runtime_config(port: u16) {
    let Some(home) = std::env::var_os("HOME") else {
        return;
    };
    let dir = PathBuf::from(home).join(".clawd");
    if fs::create_dir_all(&dir).is_err() {
        return;
    }
    let path = dir.join("runtime.json");
    let body = serde_json::json!({ "app": CLAWD_SERVER_ID, "port": port }).to_string();
    let _ = fs::write(path, body);
}
