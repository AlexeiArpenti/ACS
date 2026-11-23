from pathlib import Path

from dotenv import dotenv_values
from sqlalchemy import create_engine, text

env = dotenv_values(Path(__file__).with_name(".env"))
DATABASE_URL = env["DATABASE_URL"]

engine = create_engine(DATABASE_URL, pool_pre_ping=True)

with engine.connect():
    print("MySQL connection successful")