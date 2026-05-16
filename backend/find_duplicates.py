import os
import re

MODELS_FOLDER = r"C:\Users\User\merged-backend\app\models"

tables = {}

for file in os.listdir(MODELS_FOLDER):
    if file.endswith(".py"):
        filepath = os.path.join(MODELS_FOLDER, file)
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
        matches = re.findall(r'__tablename__\s*=\s*["\'](\w+)["\']', content)
        for table in matches:
            if table not in tables:
                tables[table] = []
            tables[table].append(file)

print("🔍 Duplicate tables found:\n")
for table, files in tables.items():
    if len(files) > 1:
        print(f"❌ Table '{table}' defined in: {files}")

print("\n✅ Single tables:")
for table, files in tables.items():
    if len(files) == 1:
        print(f"   '{table}' → {files[0]}")