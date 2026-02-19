#!/usr/bin/env bash
# Redistribute hero images from 3-way (main+knoxville+farragut) to 2-way (knoxville+farragut).
# For each .hero/ dir under content/ (non-locations), collect ALL images from main+knoxville+farragut,
# deduplicate, sort, then distribute round-robin: knoxville gets even pairs, farragut gets odd pairs.
#
# Usage: bash scripts/redistribute-hero-2way.sh [--dry-run]

set -euo pipefail

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
	DRY_RUN=true
	echo "=== DRY RUN ==="
fi

CONTENT_DIR="content"
LOCATIONS_DIR="$CONTENT_DIR/locations"

# Find all .hero dirs under main content (not locations)
find "$CONTENT_DIR" -maxdepth 6 -name "*.hero" -type d -not -path "$LOCATIONS_DIR/*" | sort | while read -r main_hero; do
	# Derive the relative path from content dir, e.g., "injectables/botox/index.hero"
	rel="${main_hero#$CONTENT_DIR/}"

	knoxville_hero="$LOCATIONS_DIR/knoxville/$rel"
	farragut_hero="$LOCATIONS_DIR/farragut/$rel"

	echo "--- Processing: $rel ---"

	# Collect all unique .webp files from all 3 locations
	tmpdir=$(mktemp -d)

	# Copy from all sources into tmpdir (later files overwrite earlier if same name)
	for src in "$main_hero" "$knoxville_hero" "$farragut_hero"; do
		if [[ -d "$src" ]]; then
			cp "$src"/*.webp "$tmpdir/" 2>/dev/null || true
		fi
	done

	# Get sorted list of unique before/after PAIR keys
	# Files are like: botox-001-before.webp, botox-001-after.webp
	# Pair key is everything before "-before.webp" or "-after.webp"
	pair_keys=()
	for f in "$tmpdir"/*-before.webp; do
		[[ -f "$f" ]] || continue
		base=$(basename "$f")
		key="${base%-before.webp}"
		pair_keys+=("$key")
	done

	# Sort pair keys
	IFS=$'\n' sorted_keys=($(sort <<<"${pair_keys[*]}"))
	unset IFS

	total=${#sorted_keys[@]}
	echo "  Total pairs: $total"

	if [[ $total -eq 0 ]]; then
		echo "  No pairs found, skipping"
		rm -rf "$tmpdir"
		continue
	fi

	# Create target dirs
	if [[ "$DRY_RUN" == "false" ]]; then
		mkdir -p "$knoxville_hero"
		mkdir -p "$farragut_hero"
		# Clear existing images in knoxville and farragut
		rm -f "$knoxville_hero"/*.webp 2>/dev/null || true
		rm -f "$farragut_hero"/*.webp 2>/dev/null || true
	fi

	knoxville_count=0
	farragut_count=0

	for i in "${!sorted_keys[@]}"; do
		key="${sorted_keys[$i]}"
		before_file="$tmpdir/${key}-before.webp"
		after_file="$tmpdir/${key}-after.webp"

		if ((i % 2 == 0)); then
			# Knoxville
			if [[ "$DRY_RUN" == "false" ]]; then
				[[ -f "$before_file" ]] && cp "$before_file" "$knoxville_hero/"
				[[ -f "$after_file" ]] && cp "$after_file" "$knoxville_hero/"
			fi
			knoxville_count=$((knoxville_count + 1))
		else
			# Farragut
			if [[ "$DRY_RUN" == "false" ]]; then
				[[ -f "$before_file" ]] && cp "$before_file" "$farragut_hero/"
				[[ -f "$after_file" ]] && cp "$after_file" "$farragut_hero/"
			fi
			farragut_count=$((farragut_count + 1))
		fi
	done

	echo "  Knoxville: $knoxville_count pairs, Farragut: $farragut_count pairs"

	rm -rf "$tmpdir"
done

echo ""
echo "=== Redistribution complete ==="

if [[ "$DRY_RUN" == "false" ]]; then
	# Count final images
	echo "Knoxville total images: $(find "$LOCATIONS_DIR/knoxville" -name "*.webp" | wc -l)"
	echo "Farragut total images: $(find "$LOCATIONS_DIR/farragut" -name "*.webp" | wc -l)"
fi
