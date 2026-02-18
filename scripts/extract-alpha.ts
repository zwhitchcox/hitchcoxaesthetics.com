import sharp from 'sharp'

/**
 * Difference matting: extract transparency from two images of the same subject,
 * one on a white background and one on a black background.
 */
export async function extractAlpha(
	imgOnWhiteBuffer: Buffer,
	imgOnBlackBuffer: Buffer,
): Promise<Buffer> {
	const img1 = sharp(imgOnWhiteBuffer)
	const img2 = sharp(imgOnBlackBuffer)

	const { data: dataWhite, info: meta } = await img1
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true })

	const { data: dataBlack } = await img2
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true })

	if (dataWhite.length !== dataBlack.length) {
		throw new Error('Dimension mismatch: Images must be identical size')
	}

	const outputBuffer = Buffer.alloc(dataWhite.length)

	// Distance between White (255,255,255) and Black (0,0,0)
	const bgDist = Math.sqrt(3 * 255 * 255)

	for (let i = 0; i < meta.width * meta.height; i++) {
		const offset = i * 4

		const rW = dataWhite[offset]!
		const gW = dataWhite[offset + 1]!
		const bW = dataWhite[offset + 2]!

		const rB = dataBlack[offset]!
		const gB = dataBlack[offset + 1]!
		const bB = dataBlack[offset + 2]!

		const pixelDist = Math.sqrt(
			Math.pow(rW - rB, 2) + Math.pow(gW - gB, 2) + Math.pow(bW - bB, 2),
		)

		let alpha = 1 - pixelDist / bgDist
		alpha = Math.max(0, Math.min(1, alpha))

		let rOut = 0,
			gOut = 0,
			bOut = 0

		if (alpha > 0.01) {
			rOut = rB / alpha
			gOut = gB / alpha
			bOut = bB / alpha
		}

		outputBuffer[offset] = Math.round(Math.min(255, rOut))
		outputBuffer[offset + 1] = Math.round(Math.min(255, gOut))
		outputBuffer[offset + 2] = Math.round(Math.min(255, bOut))
		outputBuffer[offset + 3] = Math.round(alpha * 255)
	}

	// Return trimmed PNG
	return sharp(outputBuffer, {
		raw: { width: meta.width, height: meta.height, channels: 4 },
	})
		.trim()
		.png()
		.toBuffer()
}
