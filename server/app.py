import hashlib
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import Column, DateTime, ForeignKey, MetaData, String, Table, Text, create_engine, insert, select, text, delete
from sqlalchemy.orm import Session, sessionmaker


class Settings(BaseSettings):
    database_url: str
    jwt_secret: str
    port: int = 8000
    client_origin: str = "http://127.0.0.1:5173"
    model_config = SettingsConfigDict(env_file=Path(__file__).with_name(".env"), env_file_encoding="utf-8")


settings = Settings()
engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
metadata = MetaData()

users = Table(
    "users",
    metadata,
    Column("id", String(36), primary_key=True),
    Column("email", String(191), unique=True, nullable=False),
    Column("display_name", String(80), nullable=False),
    Column("password_hash", String(64), nullable=False),
    Column("created_at", DateTime, nullable=False),
)

chats = Table(
    "chats",
    metadata,
    Column("id", String(36), primary_key=True),
    Column("name", String(100), nullable=False),
    Column("direct_key", String(80), nullable=True),
    Column("created_at", DateTime, nullable=False),
)

chat_members = Table(
    "chat_members",
    metadata,
    Column("chat_id", String(36), ForeignKey("chats.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role", String(20), nullable=False),
)

messages = Table(
    "messages",
    metadata,
    Column("id", String(36), primary_key=True),
    Column("client_message_id", String(36), nullable=False),
    Column("chat_id", String(36), ForeignKey("chats.id", ondelete="CASCADE"), nullable=False),
    Column("sender_id", String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    Column("text", Text, nullable=False),
    Column("created_at", DateTime, nullable=False),
)

metadata.create_all(engine)

with engine.begin() as migration:
    chat_columns = migration.execute(text("SHOW COLUMNS FROM chats")).mappings().all()
    if "direct_key" not in {column["Field"] for column in chat_columns}:
        migration.execute(text("ALTER TABLE chats ADD COLUMN direct_key VARCHAR(80) NULL"))

app = FastAPI(title="Relay Messenger API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.client_origin,
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=2, max_length=80)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ChatCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class MessageCreate(BaseModel):
    text: str = Field(min_length=1, max_length=10000)


def get_db():
    with SessionLocal() as db:
        yield db


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def create_token(user_id: str) -> str:
    expires = datetime.now(UTC) + timedelta(days=7)
    return jwt.encode({"sub": user_id, "exp": expires}, settings.jwt_secret, algorithm="HS256")


def current_user(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        user_id = payload["sub"]
    except (JWTError, KeyError) as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from error
    user = db.execute(select(users).where(users.c.id == user_id)).mappings().first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer exists")
    return user


@app.get("/health")
def health():
    with engine.connect():
        return {"status": "ok", "database": "connected"}


@app.post("/api/auth/register", status_code=201)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    email = str(payload.email).lower()
    existing = db.execute(select(users).where(users.c.email == email)).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email is already registered")
    user_id = str(uuid4())
    db.execute(insert(users).values(
        id=user_id,
        email=email,
        display_name=payload.display_name.strip(),
        password_hash=hash_password(payload.password),
        created_at=datetime.now(UTC),
    ))
    db.commit()
    return {"token": create_token(user_id), "user": {"id": user_id, "email": email, "displayName": payload.display_name.strip()}}


@app.post("/api/auth/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    email = str(payload.email).lower()
    user = db.execute(select(users).where(users.c.email == email)).mappings().first()
    if not user or hash_password(payload.password) != user["password_hash"]:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {"token": create_token(user["id"]), "user": {"id": user["id"], "email": user["email"], "displayName": user["display_name"]}}


@app.get("/api/auth/me")
def me(user=Depends(current_user)):
    return {"id": user["id"], "email": user["email"], "displayName": user["display_name"]}


@app.get("/api/users/search")
def search_users(q: str = "", db: Session = Depends(get_db), user=Depends(current_user)):
    query = q.strip()
    statement = select(users).where(users.c.id != user["id"])
    if query:
        statement = statement.where(users.c.display_name.ilike(f"%{query}%"))
    statement = statement.order_by(users.c.display_name).limit(20)
    rows = db.execute(statement).mappings().all()
    return [{"id": row["id"], "email": row["email"], "displayName": row["display_name"]} for row in rows]


@app.post("/api/chats/direct/{other_user_id}")
def create_direct_chat(
    other_user_id: str,
    db: Session = Depends(get_db),
    user=Depends(current_user),
):
    if other_user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot create a chat with yourself")

    other = db.execute(select(users).where(users.c.id == other_user_id)).mappings().first()
    if not other:
        raise HTTPException(status_code=404, detail="User not found")

    ids = sorted([user["id"], other_user_id])
    direct_key = f"direct:{ids[0]}:{ids[1]}"
    chat = db.execute(select(chats).where(chats.c.direct_key == direct_key)).mappings().first()

    if chat:
        chat_id = chat["id"]
        membership = db.execute(select(chat_members).where(
            chat_members.c.chat_id == chat_id,
            chat_members.c.user_id == user["id"],
        )).first()
        if not membership:
            db.execute(insert(chat_members).values(
                chat_id=chat_id,
                user_id=user["id"],
                role="MEMBER",
            ))
            db.commit()
    else:
        chat_id = str(uuid4())
        db.execute(insert(chats).values(
            id=chat_id,
            name="Direct chat",
            direct_key=direct_key,
            created_at=datetime.now(UTC),
        ))
        db.execute(insert(chat_members).values(chat_id=chat_id, user_id=user["id"], role="MEMBER"))
        db.execute(insert(chat_members).values(chat_id=chat_id, user_id=other_user_id, role="MEMBER"))
        db.commit()

    return {
        "id": chat_id,
        "name": other["display_name"] if user["id"] != other_user_id else user["display_name"],
        "created_at": datetime.now(UTC),
        "direct": True,
    }


@app.get("/api/chats")
def list_chats(db: Session = Depends(get_db), user=Depends(current_user)):
    rows = db.execute(
        select(chats)
        .join(chat_members, chat_members.c.chat_id == chats.c.id)
        .where(chat_members.c.user_id == user["id"])
        .order_by(chats.c.created_at.desc())
    ).mappings().all()
    result = []
    for row in rows:
        chat = dict(row)
        if row["direct_key"]:
            peer = db.execute(
                select(users)
                .join(chat_members, chat_members.c.user_id == users.c.id)
                .where(chat_members.c.chat_id == row["id"], users.c.id != user["id"])
            ).mappings().first()
            chat["name"] = peer["display_name"] if peer else "Direct chat"
            chat["direct"] = True
        else:
            chat["direct"] = False
        result.append(chat)
    return result


@app.post("/api/chats", status_code=201)
def create_chat(payload: ChatCreate, db: Session = Depends(get_db), user=Depends(current_user)):
    chat_id = str(uuid4())
    db.execute(insert(chats).values(id=chat_id, name=payload.name.strip(), created_at=datetime.now(UTC)))
    db.execute(insert(chat_members).values(chat_id=chat_id, user_id=user["id"], role="OWNER"))
    db.commit()
    return {"id": chat_id, "name": payload.name.strip(), "created_at": datetime.now(UTC)}


@app.delete("/api/chats/{chat_id}")
def delete_chat(chat_id: str, db: Session = Depends(get_db), user=Depends(current_user)):
    member = db.execute(select(chat_members).where(
        chat_members.c.chat_id == chat_id,
        chat_members.c.user_id == user["id"],
    )).first()
    if not member:
        raise HTTPException(status_code=403, detail="You are not a member of this chat")

    db.execute(delete(chat_members).where(
        chat_members.c.chat_id == chat_id,
        chat_members.c.user_id == user["id"],
    ))

    remaining_member = db.execute(
        select(chat_members.c.user_id)
        .where(chat_members.c.chat_id == chat_id)
        .limit(1)
    ).first()

    if not remaining_member:
        db.execute(delete(messages).where(messages.c.chat_id == chat_id))
        db.execute(delete(chats).where(chats.c.id == chat_id))

    db.commit()
    return {"deleted": True, "chat_id": chat_id}


@app.get("/api/chats/{chat_id}/messages")
def list_messages(chat_id: str, db: Session = Depends(get_db), user=Depends(current_user)):
    member = db.execute(select(chat_members).where(
        chat_members.c.chat_id == chat_id,
        chat_members.c.user_id == user["id"],
    )).first()
    if not member:
        raise HTTPException(status_code=403, detail="You are not a member of this chat")
    rows = db.execute(
        select(messages, users.c.display_name)
        .join(users, users.c.id == messages.c.sender_id)
        .where(messages.c.chat_id == chat_id)
        .order_by(messages.c.created_at)
    ).mappings().all()
    return [
        {
            "id": row["id"],
            "chat_id": row["chat_id"],
            "sender_id": row["sender_id"],
            "sender_name": row["display_name"],
            "text": row["text"],
            "created_at": row["created_at"],
        }
        for row in rows
    ]


@app.post("/api/chats/{chat_id}/messages", status_code=201)
def create_message(chat_id: str, payload: MessageCreate, db: Session = Depends(get_db), user=Depends(current_user)):
    member = db.execute(select(chat_members).where(
        chat_members.c.chat_id == chat_id,
        chat_members.c.user_id == user["id"],
    )).first()
    if not member:
        raise HTTPException(status_code=403, detail="You are not a member of this chat")
    message_id = str(uuid4())
    now = datetime.now(UTC)
    db.execute(insert(messages).values(
        id=message_id,
        client_message_id=message_id,
        chat_id=chat_id,
        sender_id=user["id"],
        text=payload.text,
        created_at=now,
    ))
    db.commit()
    return {"id": message_id, "chat_id": chat_id, "sender_id": user["id"], "text": payload.text, "created_at": now}
