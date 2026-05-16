import os

FOLDERS = [
    r"C:\Users\User\merged-backend\app\models",
    r"C:\Users\User\merged-backend\app\api",
    r"C:\Users\User\merged-backend\app\services",
]

for folder in FOLDERS:
    for file in os.listdir(folder):
        if "_myproject" in file:
            filepath = os.path.join(folder, file)
            os.remove(filepath)
            print(f"🗑️  Deleted duplicate: {file}")

print("\n✅ All duplicates deleted!")