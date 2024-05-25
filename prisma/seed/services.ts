import { prisma } from '#app/utils/db.server.js'

const services = [
	{
		title: 'Consultation',
		duration: 60,
		slug: 'consultation',
		hint: 'a personalized treatment plan',
	},
	{
		title: 'Botox',
		duration: 60,
		slug: 'botox',
		hint: 'wrinkles, fine lines',
	},
	{
		title: 'Filler',
		duration: 60,
		slug: 'filler',
		hint: 'lips, cheeks, facial balancing',
	},
	{
		title: 'Botox & Filler',
		duration: 75,
		slug: 'botox-and-filler',
		hint: 'a complete facial rejuvenation',
	},
	{
		title: 'Microneedling',
		duration: 60,
		slug: 'microneedling',
		hint: 'acne scars, fine lines, wrinkles',
	},
	{
		title: 'Laser Hair Removal',
		duration: 60,
		slug: 'laser-hair-removal',
		hint: 'painless laser hair removal for all skin types',
	},
	{
		title: 'Laser Pigmented Lesions',
		duration: 60,
		slug: 'laser-pigmented-lesions',
		hint: 'sun spots, age spots, freckles',
	},
	{
		title: 'Laser Vascular Lesions',
		duration: 60,
		slug: 'laser-vascular-lesions',
		hint: 'spider veins, broken capillaries, rosacea',
	},
	{
		title: 'Laser Skin Revitalization',
		duration: 60,
		slug: 'laser-skin-revitalization',
		hint: 'fine lines, wrinkles, enlarged pores',
	},
]

async function main() {
	for (const [i, service] of Object.entries(services)) {
		console.log(`${service.title}:\n${service.hint}\n`)
		const _service = {
			order: Number(i) * 1000,
			...service,
		}
		await prisma.service.upsert({
			where: {
				slug: service.slug,
			},
			create: _service,
			update: _service,
		})
	}
}

main()
