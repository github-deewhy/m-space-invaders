# 🚀 M-Space Invaders: Modernized Arcade Game

This project is a modernized version of the Space Invaders classic, featuring a dynamic high-score system backed by **PocketBase**.

PocketBase is a single-file Go backend that provides a database (SQLite), REST API, and authentication, making it ideal for simple, self-hosted applications.

## Project Details

* **Game Logic:** HTML5 Canvas / JavaScript
* **Backend/Server:** Node.js (`server.js`)
* **Database:** PocketBase (Self-hosted via API calls for Scoreboard)
* **Deployment:** Docker

## Features

* **Modernized Gameplay:** Includes updated mechanics or graphics (TBD).
* **Self-Sufficient Database:** Uses PocketBase for an integrated data backend.
* **Persistent Scoreboard:** Records and retrieves high scores via the PocketBase REST API.
* **Containerized:** Designed for fast, independent deployment.

## Setup & Running Locally

### 1. Prerequisites

You must have the following installed:
* [Node.js](https://nodejs.org/) and npm
* [Docker](https://www.docker.com/)

### 2. Set up PocketBase (Scoreboard)

To run the scoreboard, you must run a separate PocketBase instance first, or modify your Dockerfile for a multi-service setup. For simplicity, we assume an accessible instance:

1.  **Start PocketBase:** Download and run the PocketBase executable (e.g., on port 8090).
2.  **Create Collections:** Use the PocketBase Admin UI to create a `scores` collection with fields like `username` (string) and `score` (number).
3.  **Update `.env`:** Create a `.env` file in the root of the project to specify the API location:

    ```
    # Example .env file
    POCKETBASE_URL="http://your-server-ip:8090"
    PORT=3009
    ```
    *(Note: This file is excluded by `.gitignore` for security)*

### 3. Build and Run with Docker

1.  **Build the Docker Image:**
    ```bash
    docker build -t m-space-invaders .
    ```

2.  **Run the Container:**
    ```bash
    docker run -d --name m_space-invaders -p 3009:3009 m-space-invaders
    ```
    The game will be accessible in your web browser at `http://localhost:3009`.

## Deployment to Docker Hub

This image is available publicly on Docker Hub under the `deewhy` namespace:

```bash
docker pull deewhy/m-space-invaders:latest
