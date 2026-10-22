from pathlib import Path
import shutil
root=Path(__file__).resolve().parents[1]
dest=root/'android/app/src/main/assets/index.html'
dest.parent.mkdir(parents=True,exist_ok=True)
shutil.copyfile(root/'web/index.html',dest)
print('Android assets synchronized.')
