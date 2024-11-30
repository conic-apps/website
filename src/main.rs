use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod routes;

static CONFIG: OnceCell<Config> = OnceCell::new();

#[tokio::main]
async fn main() {
    // initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                format!("{}=debug,tower_http=debug", env!("CARGO_CRATE_NAME")).into()
            }),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();
    // load config
    let config = match load_config().await {
        Ok(x) => x,
        Err(_) => {
            let default_config = Config::default();
            tokio::fs::write(
                "Conic.toml",
                toml::to_string_pretty(&default_config).unwrap(),
            )
            .await
            .expect("Cannot write config file");
            default_config
        }
    };

    CONFIG
        .set(config.clone())
        .expect("Could not set global config");

    let router = axum::Router::new()
        .merge(routes::api())
        .merge(routes::web())
        .merge(routes::static_files());

    // run our app with hyper, listening globally on port 3000
    let attr = format!("{}:{}", config.address, config.port);
    let listener = tokio::net::TcpListener::bind(&attr).await.unwrap();
    println!("Server is running on {attr}");
    axum::serve(listener, router).await.unwrap();
}

async fn load_config() -> anyhow::Result<Config> {
    let raw = tokio::fs::read_to_string("Conic.toml").await?;
    Ok(toml::from_str::<Config>(&raw)?)
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct Config {
    address: String,
    port: usize,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            address: "0.0.0.0".to_string(),
            port: 3000,
        }
    }
}
