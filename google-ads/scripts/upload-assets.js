require('dotenv').config()
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const crypto = require('crypto')
const { GoogleAdsApi, enums } = require('google-ads-api')

const client = new GoogleAdsApi({
	client_id: process.env.GOOGLE_ADS_CLIENT_ID || '',
	client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET || '',
	developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
})

const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID || ''
const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN || ''

const customer = client.Customer({
	customer_id: customerId.replace(/-/g, ''),
	refresh_token: refreshToken,
})

async function convertImageForGoogleAds(sourcePath) {
	// Google Ads requires images in JPEG, PNG, or GIF. No WebP.
	const tempDir = path.join(__dirname, 'tmp_images')
	if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir)

	const hash = crypto.createHash('md5').update(sourcePath).digest('hex')
	const destPath = path.join(tempDir, `${hash}.jpg`)

	await sharp(sourcePath).jpeg({ quality: 90 }).toFile(destPath)

	const data = fs.readFileSync(destPath)
	return {
		data: data,
		name: path.basename(sourcePath),
		tempPath: destPath,
	}
}

async function uploadImageToAssetLibrary(imagePath) {
	console.log(`Uploading ${imagePath}...`)
	try {
		const { data, name } = await convertImageForGoogleAds(imagePath)

		const request = {
			entity: 'asset',
			operation: 'create',
			resource: {
				type: enums.AssetType.IMAGE,
				name: name,
				image_asset: {
					data: data.toString('base64'),
				},
			},
		}

		const response = await customer.mutateResources([request])
		const resourceName = response.results[0].resource_name
		console.log(`✅ Uploaded: ${resourceName}`)
		return resourceName
	} catch (error) {
		console.error(`❌ Failed to upload ${imagePath}:`, error.message || error)
		return null
	}
}

async function main() {
	if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
		console.log(
			'⚠️  Credentials missing. Cannot upload images to live account.',
		)
		return
	}

	const imagesToUpload = [
		path.join(
			__dirname,
			'../../public/img/before-after/botox-forehead-lines-001-after.webp',
		),
		path.join(
			__dirname,
			'../../public/img/before-after/filler-lip-filler-001-after.webp',
		),
		path.join(
			__dirname,
			'../../public/img/before-after/laser-hair-removal-001-after.webp',
		),
		path.join(
			__dirname,
			'../../public/img/before-after/semaglutide-001-after.webp',
		),
		path.join(
			__dirname,
			'../../public/img/before-after/microneedling-001-after.webp',
		),
		path.join(__dirname, '../../public/logo-lg.png'),
	]

	const uploadedAssets = {}

	for (const imgPath of imagesToUpload) {
		if (fs.existsSync(imgPath)) {
			const assetResourceName = await uploadImageToAssetLibrary(imgPath)
			if (assetResourceName) {
				uploadedAssets[imgPath] = assetResourceName
			}
		} else {
			console.error(`File not found: ${imgPath}`)
		}
	}

	console.log(
		'\n=== Uploaded Asset Map (Use these resource names in PMax/DemandGen) ===',
	)
	console.log(JSON.stringify(uploadedAssets, null, 2))
}

main()
