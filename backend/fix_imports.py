import os

FOLDERS = [
    r"C:\Users\User\merged-backend\app\models",
    r"C:\Users\User\merged-backend\app\api",
    r"C:\Users\User\merged-backend\app\services",
]

# Old import → New import
REPLACEMENTS = {
    "from database import Base":         "from app.db.base import Base",
    "from database import engine":       "from app.db.session import engine",
    "from database import SessionLocal": "from app.db.session import SessionLocal",
    "from database import get_db":       "from app.db.session import get_db",
}

def fix_file(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    original = content
    for old, new in REPLACEMENTS.items():
        content = content.replace(old, new)

    if content != original:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"✅ Fixed: {filepath}")

for folder in FOLDERS:
    for file in os.listdir(folder):
        if file.endswith(".py"):
            fix_file(os.path.join(folder, file))

print("\n🎉 All imports fixed!")