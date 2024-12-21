// Amethyst Launcher Website
// Copyright 2022-2025 Broken-Deer and contributors. All rights reserved.
// SPDX-License-Identifier: GPL-3.0-only

use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgPoolOptions;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod controllers;
mod listeners;
mod models;
mod routes;
mod tasks;

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
    let config =  load_config().await.expect("Could not load config");

    CONFIG
        .set(config.clone())
        .expect("Could not set global config");

    let database_url = format!(
        "postgres://{user}:{password}@{host}/{database}",
        user = config.database.user,
        password = config.database.password,
        host= config.database.host,
        database = config.database.database
    );
    let db = PgPoolOptions::new().max_connections(10).connect(&database_url).await.expect("Could not connect to database");

    // This embeds database migrations in the application binary so we can ensure the database
    // is migrated correctly on startup
    sqlx::migrate!().run(&db).await.unwrap();

    
    let router = axum::Router::new()
        .merge(routes::api())
        .merge(routes::web())
        .merge(routes::static_files());

    // run schedule tasks
    tokio::spawn(crate::tasks::run_tasks());

    // run app
    let attr = format!("{}:{}", config.address, config.port);
    let listener = tokio::net::TcpListener::bind(&attr).await.unwrap();
    println!("Server is running on {attr}");
    axum::serve(listener, router).await.unwrap();
}

async fn load_config() -> anyhow::Result<Config> {
    let raw = tokio::fs::read_to_string(".env.toml").await?;
    Ok(toml::from_str::<Config>(&raw)?)
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct Config {
    address: String,
    port: usize,
    database: DatabaseConfig
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct DatabaseConfig {
    host: String,
    user: String,
    password: String,
    database: String,
}
