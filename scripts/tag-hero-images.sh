#!/bin/bash
# Tag all hero images with EXIF metadata for SEO
# - Author: Sarah Hitchcox
# - Copyright: Sarah Hitchcox Aesthetics
# - Location: GPS coordinates with small random jitter + city name

# Knoxville office: 5113 Kingston Pike, Knoxville, TN 37919
# Center GPS: 35.9465, -83.9785
KNOX_LAT_BASE="35.9465"
KNOX_LON_BASE="83.9785"

# Farragut office: 102 S Campbell Station Rd, Knoxville, TN 37934
# Center GPS: 35.8870, -84.1690
FARR_LAT_BASE="35.8870"
FARR_LON_BASE="84.1690"

# Jitter: ~0.0001-0.0015 degrees ≈ 10-150 meters radius (within a building/parking lot)
jitter() {
	# Returns a random offset between -0.0012 and +0.0012
	local base=$1
	local offset=$(awk "BEGIN{srand(); printf \"%.4f\", (rand()-0.5)*0.0024}")
	echo $(awk "BEGIN{printf \"%.4f\", $base + $offset}")
}

tag_file() {
	local f="$1"
	local lat="$2"
	local lon="$3"
	local city="$4"
	local address="$5"

	exiftool -overwrite_original \
		"-Artist=Sarah Hitchcox" \
		"-Copyright=© Sarah Hitchcox Aesthetics" \
		"-XMP-dc:Creator=Sarah Hitchcox" \
		"-XMP-dc:Rights=© Sarah Hitchcox Aesthetics" \
		"-XMP-photoshop:Credit=Sarah Hitchcox Aesthetics" \
		"-GPSLatitude=$lat" "-GPSLatitudeRef=N" \
		"-GPSLongitude=$lon" "-GPSLongitudeRef=W" \
		"-XMP-photoshop:City=$city" \
		"-XMP-photoshop:State=Tennessee" \
		"-XMP-photoshop:Country=United States" \
		"-XMP-iptcCore:Location=$address" \
		"$f" 2>/dev/null
}

echo "=== Tagging Main Service Images (Knoxville default) ==="
count=0
find content -path content/locations -prune -o -name "*.webp" -print | while read f; do
	lat=$(jitter "$KNOX_LAT_BASE")
	lon=$(jitter "$KNOX_LON_BASE")
	tag_file "$f" "$lat" "$lon" "Knoxville" "5113 Kingston Pike"
	count=$((count + 1))
done
echo "Done with main images"

echo ""
echo "=== Tagging Knoxville Location Images ==="
find content/locations/knoxville -name "*.webp" | while read f; do
	lat=$(jitter "$KNOX_LAT_BASE")
	lon=$(jitter "$KNOX_LON_BASE")
	tag_file "$f" "$lat" "$lon" "Knoxville" "5113 Kingston Pike"
done
echo "Done with Knoxville images"

echo ""
echo "=== Tagging Farragut Location Images ==="
find content/locations/farragut -name "*.webp" | while read f; do
	lat=$(jitter "$FARR_LAT_BASE")
	lon=$(jitter "$FARR_LON_BASE")
	tag_file "$f" "$lat" "$lon" "Farragut" "102 S Campbell Station Rd"
done
echo "Done with Farragut images"

echo ""
echo "=== Summary ==="
echo -n "Main images: "
find content -path content/locations -prune -o -name "*.webp" -print | wc -l | tr -d ' '
echo -n "Knoxville images: "
find content/locations/knoxville -name "*.webp" | wc -l | tr -d ' '
echo -n "Farragut images: "
find content/locations/farragut -name "*.webp" | wc -l | tr -d ' '
