use axum::Router;
use tower_http::services::ServeDir;

pub fn api() -> Router {
    Router::new()
}

pub fn web() -> Router {
    Router::new()
}

pub fn static_files() -> Router {
    Router::new().nest_service("/assets", ServeDir::new("public/assets"))
}
