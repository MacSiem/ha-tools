import os, sys, base64, glob
from PIL import Image
from io import BytesIO

DIR = os.path.dirname(os.path.abspath(__file__))
files = sorted(glob.glob(os.path.join(DIR, 'v39-*.png')))

for f in files:
    name = os.path.splitext(os.path.basename(f))[0]
    img = Image.open(f)
    # Resize to 40% width
    w, h = img.size
    new_w = int(w * 0.4)
    new_h = int(h * 0.4)
    img = img.resize((new_w, new_h), Image.LANCZOS)
    # Save as JPEG
    buf = BytesIO()
    img.save(buf, format='JPEG', quality=65)
    jpg_bytes = buf.getvalue()
    b64 = base64.b64encode(jpg_bytes).decode()
    # Save b64 file
    b64_path = os.path.join(DIR, name + '.b64')
    with open(b64_path, 'w') as bf:
        bf.write(b64)
    print(f'{name}: {len(jpg_bytes)} bytes, b64: {len(b64)} chars')
