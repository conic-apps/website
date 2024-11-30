use axum::{routing::get, Router};
use tower_http::services::ServeDir;

pub fn api() -> Router {
    Router::new()
}

pub fn web() -> Router {
    Router::new()
        .route("/", get(crate::pages::index_template))
        .route("/download", get(crate::pages::download_template))
}

pub fn static_files() -> Router {
    Router::new().nest_service("/assets", ServeDir::new("public/assets"))
}
