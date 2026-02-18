#!/bin/bash
# Auto-generated script to create all missing before/after images.
# Re-run: tsx scripts/generate-images.ts --generate-script
#
# To regenerate a single service, comment out the others.
# Each service generates BOTH before and after to ensure they match.
#
# Missing: 32 images across 16 services

set -e

if [ -z "$OPENAI_API_KEY" ]; then
  echo "Error: OPENAI_API_KEY is required"
  exit 1
fi

# --- botox-forehead-lines (Botox for forehead lines) ---
tsx scripts/generate-images.ts "botox-forehead-lines"

# --- botox-frown-lines (Botox for the vertical lines between the eyebrows) ---
tsx scripts/generate-images.ts "botox-frown-lines"

# --- botox-crows-feet (Botox for crow's feet) ---
tsx scripts/generate-images.ts "botox-crows-feet"

# --- botox-lip-flip (Botox lip flip) ---
tsx scripts/generate-images.ts "botox-lip-flip"

# --- botox-bunny-lines (Botox for bunny lines) ---
tsx scripts/generate-images.ts "botox-bunny-lines"

# --- botox-gummy-smile (Botox for gummy smile) ---
tsx scripts/generate-images.ts "botox-gummy-smile"

# --- botox-chin-dimpling (Botox for chin dimpling) ---
tsx scripts/generate-images.ts "botox-chin-dimpling"

# --- botox-brow-lift (Botox brow lift) ---
tsx scripts/generate-images.ts "botox-brow-lift"

# --- filler-lip-filler (Lip filler) ---
tsx scripts/generate-images.ts "filler-lip-filler"

# --- filler-cheek-filler (Cheek filler) ---
tsx scripts/generate-images.ts "filler-cheek-filler"

# --- filler-chin-filler (Chin filler) ---
tsx scripts/generate-images.ts "filler-chin-filler"

# --- filler-jawline-filler (Jawline filler) ---
tsx scripts/generate-images.ts "filler-jawline-filler"

# --- filler-under-eye-filler (Under-eye filler) ---
tsx scripts/generate-images.ts "filler-under-eye-filler"

# --- filler-nasolabial-folds (Nasolabial fold filler) ---
tsx scripts/generate-images.ts "filler-nasolabial-folds"

# --- microneedling-face (Face microneedling for skin texture) ---
tsx scripts/generate-images.ts "microneedling-face"

# --- microneedling-hair-loss (Scalp microneedling for hair regrowth) ---
tsx scripts/generate-images.ts "microneedling-hair-loss"

echo "All missing images generated!"
