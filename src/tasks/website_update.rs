use std::time::Duration;

use serde::Deserialize;
use tokio::time::sleep;

pub async fn task() {
    println!("Scheduled task: check website update");
    loop {
        sleep(Duration::from_secs(24 * 60 * 60)).await;
        let mut retried = 0;
        while retried < 5 {
            match update_website().await {
                Ok(_) => break,
                Err(_) => retried += 1,
            };
            println!("Task failed, retry: {retried}, retry task after 60 secs");
            sleep(Duration::from_secs(60)).await;
        }
    }
}

async fn update_website() -> anyhow::Result<()> {
    println!("Checking Website Update");
    let a = reqwest::Client::new()
        .get("https://api.github.com/repos/Conic-Sections/Amethyst-Launcher/releases")
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "Amethyst-Website")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await?
        .json::<Vec<Release>>()
        .await?;
    println!("{:#?}", a);
    Ok(())
}

#[derive(Debug, Clone, Deserialize)]
struct Release {}
