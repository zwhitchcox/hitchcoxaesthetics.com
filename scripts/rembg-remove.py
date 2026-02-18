#!/usr/bin/env python3
"""Remove background from an image using rembg.
Usage: python3 rembg-remove.py input.png output.png [model]
Models: u2net (high quality), u2netp (fast), u2net_human_seg (people), isnet-general-use
"""

import sys
from rembg import remove, new_session

input_path = sys.argv[1]
output_path = sys.argv[2]
model_name = sys.argv[3] if len(sys.argv) > 3 else "birefnet-portrait"

session = new_session(model_name)

with open(input_path, "rb") as f:
    input_data = f.read()

output_data = remove(input_data, session=session)

with open(output_path, "wb") as f:
    f.write(output_data)
