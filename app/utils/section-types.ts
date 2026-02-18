export type SitePage = {
	path: string
	name: string
	tagline: string
	title: string
	metaDescription: string
	content: string
	heroImage?: string
	/** All before/after image paths for the carousel (alternating before, after) */
	heroImages?: string[]
	parent?: string
	children?: string[]
	enabled: boolean
	locationId?: string
	locationName?: string
	whyChooseTitle?: string
	whyChoose?: string
	shortDescription?: string
	ctaText?: string
	faq?: { question: string; answer: string }[]
	sections?: ServicePageSection[]
}

export type LocationServiceData = {
	slug: string
	locationName: string
	locationId: string
	serviceName: string
	serviceSlug: string
	title: string
	metaDescription: string
	h1: string
	h2: string
	introParagraph: string
	bodyParagraph: string
	shortDescription?: string
	tagline?: string
	whyChooseTitle?: string
	whyChoose?: string
	ctaText: string
	heroImage?: string
	/** All before/after image paths for the carousel (alternating before, after) */
	heroImages?: string[]
	sections?: ServicePageSection[]
}

export type ServicePageSection =
	| { type: 'text-block'; title?: string; content: string }
	| {
			type: 'features-grid'
			title?: string
			items: { title: string; description: string; icon?: string }[]
	  }
	| {
			type: 'faq-accordion'
			title?: string
			items: { question: string; answer: string }[]
	  }
	| {
			type: 'image-gallery'
			title?: string
			images: { src: string; alt: string }[]
	  }
	| {
			type: 'cta-banner'
			title: string
			text: string
			buttonText: string
			link: string
	  }
	| { type: 'testimonials'; items: { quote: string; author: string }[] }
