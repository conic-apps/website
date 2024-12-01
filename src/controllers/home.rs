// Amethyst Launcher Website
// Copyright 2022-2025 Broken-Deer and contributors. All rights reserved.
// SPDX-License-Identifier: GPL-3.0-only

use askama_axum::Template;

#[derive(Template)]
#[template(path = "home.html")]
pub struct HomeTemplate {}

pub async fn home_template() -> HomeTemplate {
    HomeTemplate {}
}
