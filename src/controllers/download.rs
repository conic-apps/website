use askama_axum::Template;

#[derive(Template)]
#[template(path = "download.html")]
pub struct DownloadTemplate {}

pub async fn download_template() -> DownloadTemplate {
    DownloadTemplate {}
}
