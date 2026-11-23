# Relay Messenger

Relay is a full-stack messenger web project with user registration, login, direct chats, group creation, chat search, message history, and chat deletion.

## Stack

- React + TypeScript + Vite
- FastAPI
- SQLAlchemy + PyMySQL
- MySQL
- Nginx

## Local setup

### 1. Install frontend dependencies

```powershell
npm install
```

### 2. Create and activate the Python environment

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r server\requirements.txt
```

### 3. Configure MySQL

Create a database and a dedicated MySQL user:

```sql
CREATE DATABASE messenger
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER 'messenger'@'localhost'
  IDENTIFIED BY 'change-me';

GRANT ALL PRIVILEGES ON messenger.* TO 'messenger'@'localhost';
FLUSH PRIVILEGES;
```

Copy the environment template:

```powershell
Copy-Item server\.env.example server\.env
```

Replace the example database password and JWT secret in `server/.env`.

### 4. Start the API

```powershell
.\.venv\Scripts\python.exe -m uvicorn server.app:app --host 127.0.0.1 --port 8000
```

API documentation:

```text
http://127.0.0.1:8000/docs
```

### 5. Start the web client

Development server:

```powershell
npm run dev
```

Production build:

```powershell
npm run build
```

The public build is written to `dist/`.

## Features

- Registration and login
- Separate chat history for each user
- User search by display name
- Direct chats between users
- Group chat creation
- Message history
- Automatic message polling
- Chat deletion
- Reopening direct chats after deletion

## Security note

Before public deployment, replace the current educational password hash with a password KDF such as Argon2 or bcrypt, use HTTPS, rotate the JWT secret, add rate limiting, and restrict CORS to deployed domains.
