mod website_update;

pub async fn run_tasks() {
    tokio::join!(website_update::task());
}
