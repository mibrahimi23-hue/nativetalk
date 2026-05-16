import os

FOLDERS = [
    r"C:\Users\User\merged-backend\app\models",
    r"C:\Users\User\merged-backend\app\api",
    r"C:\Users\User\merged-backend\app\services",
    r"C:\Users\User\merged-backend\app\api\v1\endpoints",
]

REPLACEMENTS = {
    "from app.models.tutor import Teacher": "from app.models.teacher import Teacher",
    "from app.models.tutor import":         "from app.models.teacher import",
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
    if not os.path.exists(folder):
        continue
    for file in os.listdir(folder):
        if file.endswith(".py"):
            fix_file(os.path.join(folder, file))

print("\n🎉 All tutor imports fixed!")