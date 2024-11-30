use askama_axum::Template;

#[derive(Template)]
#[template(path = "index.html")]
pub struct IndexTemplate {}

pub async fn index_template() -> IndexTemplate {
    IndexTemplate {}
}

#[derive(Template)]
#[template(path = "download.html")]
pub struct DownloadTemplate {}

pub async fn download_template() -> DownloadTemplate {
    DownloadTemplate {}
}
