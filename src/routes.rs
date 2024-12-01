// Amethyst Launcher Website
// Copyright 2022-2025 Broken-Deer and contributors. All rights reserved.
// SPDX-License-Identifier: GPL-3.0-only

use axum::{routing::get, Router};
use tower_http::services::ServeDir;

pub fn api() -> Router {
    Router::new()
}

pub fn web() -> Router {
    Router::new()
        .route("/", get(crate::controllers::home_template))
        .route("/download", get(crate::controllers::download_template))
}

pub fn static_files() -> Router {
    Router::new().nest_service("/assets", ServeDir::new("public/assets"))
}
