use askama_axum::Template;

#[derive(Template)]
#[template(path = "home.html")]
pub struct HomeTemplate {}

pub async fn home_template() -> HomeTemplate {
    HomeTemplate {}
}
