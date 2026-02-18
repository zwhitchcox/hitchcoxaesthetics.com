import { type ServicePageSection } from './location-service-data.js'

export type SitePage = {
	// URL path (e.g., "botox", "botox/lip-flip", "knoxville-botox")
	path: string
	// Display name (e.g., "Botox", "Lip Flip")
	name: string
	// For ServiceLayout hero
	tagline: string // 3-5 words like "for fine lines and wrinkles"
	// SEO
	title: string // <title> tag (max 60 chars)
	metaDescription: string // (150-160 chars)
	// Body content in markdown
	content: string
	// Hero image (optional, will use placeholder if missing)
	heroImage?: string
	// Parent path (null for categories, e.g., "injectables" for "botox")
	parent?: string
	// Children paths (for category/service pages that list sub-services)
	children?: string[]
	// Whether this page is commented out / disabled
	enabled: boolean
	// Location-specific fields (null for base pages)
	locationId?: string // "knoxville" | "farragut"
	locationName?: string // "Knoxville" | "Farragut"
	// Keyword-rich "Why Choose" section
	whyChooseTitle?: string
	whyChoose?: string
	// Short description for card grids
	shortDescription?: string
	// CTA
	ctaText?: string
	// FAQ for JSON-LD (optional)
	faq?: { question: string; answer: string }[]
	// Rich content sections
	sections?: ServicePageSection[]
}

// ---------------------------------------------------------------------------
// Site Pages Record – keyed by path
// ---------------------------------------------------------------------------

export const sitePages: Record<string, SitePage> = {
	// ═══════════════════════════════════════════════
	// CATEGORY PAGES
	// ═══════════════════════════════════════════════

	injectables: {
		path: 'injectables',
		name: 'Injectables',
		tagline: 'for a refreshed, youthful look',
		title: 'Injectables | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Explore our full range of injectable treatments including Botox, dermal fillers, SkinVive, and Kybella in Knoxville and Farragut, TN at Sarah Hitchcox Aesthetics.',
		content: `We offer a comprehensive suite of injectable treatments designed to smooth wrinkles, restore volume, enhance contours, and refine your natural beauty. Whether you are looking to soften fine lines with Botox, add definition with dermal fillers, boost skin hydration with SkinVive, or sculpt your jawline with Kybella, our experienced team will craft a personalized plan tailored to your goals.

Browse our injectable services below to learn more about each treatment and find the right option for you.`,
		children: ['botox', 'filler', 'skinvive', 'kybella', 'jeuveau', 'dysport'],
		enabled: true,
		shortDescription:
			'Botox, fillers, SkinVive, and Kybella to smooth, volumize, and contour.',
		ctaText: 'Explore Injectables',
		sections: [
			{
				type: 'features-grid',
				title: 'Our Injectable Treatments',
				items: [
					{
						title: 'Relax & Smooth',
						description: 'Botox smoothes wrinkles by relaxing muscles.',
						icon: 'smile',
					},
					{
						title: 'Volumize & Lift',
						description: 'Dermal fillers restore lost volume and contour.',
						icon: 'layers',
					},
					{
						title: 'Hydrate & Glow',
						description: 'SkinVive improves skin smoothness and hydration.',
						icon: 'droplet',
					},
					{
						title: 'Sculpt & Define',
						description: 'Kybella permanently reduces chin fat.',
						icon: 'scissors',
					},
				],
			},
		],
	},

	'laser-services': {
		path: 'laser-services',
		name: 'Laser Services',
		tagline: 'for clearer, smoother skin',
		title: 'Laser Services | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Advanced laser treatments for hair removal, skin revitalization, pigmented lesions, and vascular lesions in Knoxville and Farragut, TN. Sarah Hitchcox Aesthetics.',
		content: `Our state-of-the-art laser platform delivers safe, effective treatments for a wide variety of skin concerns. From permanent hair reduction to correcting sun damage, spider veins, and uneven texture, our laser services are suitable for all skin types and require little to no downtime.

Explore the laser treatments we offer below to find the solution that matches your skin goals.`,
		children: [
			'laser-hair-removal',
			'skin-revitalization',
			'pigmented-lesion-reduction',
			'vascular-lesion-reduction',
			'everesse',
		],
		enabled: true,
		shortDescription:
			'Hair removal, skin revitalization, lesion reduction, and skin tightening with advanced laser and energy technology.',
		ctaText: 'Explore Laser Services',
		sections: [
			{
				type: 'features-grid',
				title: 'Comprehensive Laser Solutions',
				items: [
					{
						title: 'Hair Removal',
						description: 'Permanent reduction for smooth skin.',
						icon: 'zap',
					},
					{
						title: 'Revitalization',
						description: 'Treat fine lines and improve texture.',
						icon: 'sun',
					},
					{
						title: 'Pigment Correction',
						description: 'Fade sun spots and age spots.',
						icon: 'target',
					},
					{
						title: 'Vascular Therapy',
						description: 'Reduce redness and spider veins.',
						icon: 'activity',
					},
					{
						title: 'Skin Tightening',
						description: 'Everesse radiofrequency to firm and lift.',
						icon: 'layers',
					},
				],
			},
		],
	},

	microneedling: {
		path: 'microneedling',
		name: 'Microneedling',
		tagline: 'for collagen renewal',
		title: 'Microneedling | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Microneedling for face and hair loss at Sarah Hitchcox Aesthetics in Knoxville and Farragut, TN. Stimulate collagen for smoother skin and thicker hair.',
		content: `Microneedling is a versatile, minimally invasive treatment that harnesses your body's natural healing response to rejuvenate your skin and even promote hair regrowth. By creating thousands of tiny micro-channels, microneedling triggers a surge of collagen and elastin production that smooths texture, reduces scarring, and restores a youthful glow.

We offer microneedling for the face as well as specialized scalp microneedling for hair loss prevention and regrowth. Learn more about each option below.`,
		children: ['microneedling/face', 'microneedling/hair-loss'],
		enabled: true,
		shortDescription:
			'Collagen-boosting microneedling for skin rejuvenation and hair restoration.',
		ctaText: 'Explore Microneedling',
		sections: [
			{
				type: 'features-grid',
				title: 'Benefits of Microneedling Treatment',
				items: [
					{
						title: 'Collagen Boost',
						description: 'Stimulates natural collagen and elastin.',
						icon: 'arrow-up',
					},
					{
						title: 'Versatile',
						description: 'Effective for face and scalp applications.',
						icon: 'check-circle',
					},
					{
						title: 'Safe',
						description: 'Minimally invasive and safe for all skin types.',
						icon: 'shield',
					},
				],
			},
			{
				type: 'faq-accordion',
				title: 'Microneedling Frequently Asked Questions',
				items: [
					{
						question: 'What is microneedling?',
						answer:
							'Microneedling is a cosmetic procedure that involves pricking the skin with tiny, sterilized needles. The small wounds cause your body to make more collagen and elastin, which heal your skin and help to achieve a more youthful appearance.',
					},
					{
						question: 'Is microneedling painful?',
						answer:
							'Patients might experience mild discomfort during the procedure, but topical numbing cream is applied beforehand to minimize any pain.',
					},
					{
						question:
							'How long does it take to see results from microneedling?',
						answer:
							'While some effects can be seen immediately, optimal results typically emerge after several sessions and over a few months as collagen production increases.',
					},
					{
						question: 'What are the side effects of microneedling?',
						answer:
							'Common side effects include redness, swelling, and mild irritation, similar to a sunburn, which usually subside within a few days.',
					},
					{
						question: 'Can microneedling be done on all skin types?',
						answer: 'Yes, microneedling is safe for all skin types.',
					},
					{
						question: 'How often can I undergo microneedling?',
						answer:
							'It is generally recommended to wait 4-6 weeks between sessions to allow the skin to heal and regenerate.',
					},
				],
			},
		],
		faq: [
			{
				question: 'What is microneedling?',
				answer:
					'Microneedling is a cosmetic procedure that involves pricking the skin with tiny, sterilized needles. The small wounds cause your body to make more collagen and elastin, which heal your skin and help to achieve a more youthful appearance.',
			},
			{
				question: 'Is microneedling painful?',
				answer:
					'Patients might experience mild discomfort during the procedure, but topical numbing cream is applied beforehand to minimize any pain.',
			},
			{
				question: 'How long does it take to see results from microneedling?',
				answer:
					'While some effects can be seen immediately, optimal results typically emerge after several sessions and over a few months as collagen production increases.',
			},
			{
				question: 'What are the side effects of microneedling?',
				answer:
					'Common side effects include redness, swelling, and mild irritation, similar to a sunburn, which usually subside within a few days.',
			},
			{
				question: 'Can microneedling be done on all skin types?',
				answer: 'Yes, microneedling is safe for all skin types.',
			},
			{
				question: 'How often can I undergo microneedling?',
				answer:
					'It is generally recommended to wait 4-6 weeks between sessions to allow the skin to heal and regenerate.',
			},
		],
	},

	'weight-loss': {
		path: 'weight-loss',
		name: 'Weight Loss',
		tagline: 'for sustainable results',
		title: 'Weight Loss | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Medical weight loss programs with semaglutide and tirzepatide in Knoxville and Farragut, TN. Sarah Hitchcox Aesthetics.',
		content: `Achieving and maintaining a healthy weight is a journey, and we are here to support you every step of the way. Our medically supervised weight loss programs combine FDA-approved medications with personalized lifestyle guidance for safe, sustainable results.

Explore our weight loss offerings below, including GLP-1 and GIP/GLP-1 receptor agonist injections for proven, sustainable weight loss.`,
		children: ['semaglutide', 'tirzepatide'],
		enabled: true,
		shortDescription:
			'Medically supervised weight loss with semaglutide and tirzepatide.',
		ctaText: 'Explore Weight Loss',
		sections: [
			{
				type: 'features-grid',
				title: 'Medically Supervised Weight Loss',
				items: [
					{
						title: 'Semaglutide (GLP-1)',
						description:
							'Once-weekly injections for proven, sustainable weight loss.',
						icon: 'trending-down',
					},
					{
						title: 'Tirzepatide (GIP/GLP-1)',
						description:
							'Dual-action injections for significant weight reduction.',
						icon: 'activity',
					},
					{
						title: 'Expert Guidance',
						description:
							'Medically supervised programs tailored to your goals.',
						icon: 'user-check',
					},
				],
			},
		],
	},

	// ═══════════════════════════════════════════════
	// INJECTABLES – SERVICE PAGES
	// ═══════════════════════════════════════════════

	botox: {
		path: 'botox',
		name: 'Botox',
		tagline: 'for wrinkles and fine lines',
		title: 'Botox | Sarah Hitchcox Aesthetics',
		metaDescription:
			"FDA-approved Botox injections for wrinkles, fine lines, crow's feet, and frown lines in Knoxville and Farragut, TN. Natural results by Sarah Hitchcox, RN.",
		content: `## What is Botox?

Botox is a safe, FDA-approved treatment that helps reduce facial wrinkles and lines. It works by relaxing the muscles under the skin that cause fine lines, smoothing them out for a more youthful appearance. Results typically begin to appear within 3-7 days, with full effect at 14 days.

## Benefits of Botox

Botox is a popular injectable treatment that temporarily relaxes facial muscles to reduce the appearance of fine lines and wrinkles, as well as prevent new lines from forming. Botox is a safe, effective, and minimally invasive treatment that can be used to treat the following:

- **Forehead Lines** — Reduces horizontal lines across the forehead.
- **Frown Lines** — Softens vertical lines between the eyebrows, known as "11 lines."
- **Crow's Feet** — Diminishes fine lines around the corners of the eyes.
- **Bunny Lines** — Treats wrinkles on the sides of the nose during smiling.
- **Lip Lines** — Smoothens vertical lines around the lips, often referred to as "smoker's lines."
- **Gummy Smile** — Adjusts muscle balance to reduce gum exposure when smiling.
- **Chin Dimpling** — Reduces dimpled or "orange peel" texture on the chin.
- **Eyebrow Lift** — Subtly lifts the eyebrows for an enhanced eye area.

## Why Choose Sarah Hitchcox Aesthetics?

At Sarah Hitchcox Aesthetics, we take a conservative, natural-looking approach to every Botox treatment. Our goal is for you to look refreshed and rested — never frozen or overdone. Sarah customizes every treatment to your unique facial anatomy and aesthetic goals, ensuring beautiful, balanced results.`,
		parent: 'injectables',
		children: [
			'botox/forehead-lines',
			'botox/frown-lines',
			'botox/crows-feet',
			'botox/lip-flip',
			'botox/bunny-lines',
			'botox/gummy-smile',
			'botox/chin-dimpling',
			'botox/brow-lift',
		],
		enabled: true,
		whyChooseTitle: 'Expert Botox Injections in Knoxville & Farragut',
		whyChoose:
			"Sarah Hitchcox Aesthetics is a premier Botox provider in Knoxville and Farragut, TN. We specialize in preventative Botox, Botox for forehead lines, crow's feet treatment, and full-face wrinkle reduction that delivers natural, refreshed results.",
		shortDescription:
			'FDA-approved Botox injections to smooth wrinkles and prevent new lines from forming.',
		ctaText: 'Book Botox',
		sections: [
			{
				type: 'features-grid',
				title: 'Benefits of Botox Treatment',
				items: [
					{
						title: 'Quick Treatment',
						description: 'Appointments take just 10-15 minutes.',
						icon: 'clock',
					},
					{
						title: 'Proven Results',
						description: 'The #1 selling product of its kind in the world.',
						icon: 'check-circle',
					},
					{
						title: 'No Downtime',
						description: 'Return to your daily routine immediately.',
						icon: 'calendar',
					},
				],
			},
			{
				type: 'faq-accordion',
				title: 'Botox Frequently Asked Questions',
				items: [
					{
						question: 'How long does Botox last?',
						answer:
							'Results typically last 3-4 months. Regular treatments can help results last longer over time.',
					},
					{
						question: 'Is it painful?',
						answer:
							'Most patients report only a mild pinch. We use tiny needles for maximum comfort.',
					},
					{
						question: 'Will I look frozen?',
						answer:
							'Not with us. We specialize in natural-looking results that smooth lines while maintaining expression.',
					},
				],
			},
		],
	},

	filler: {
		path: 'filler',
		name: 'Filler',
		tagline: 'for lips, cheeks, facial balancing',
		title: 'Filler | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Dermal filler treatments for lips, cheeks, chin, jawline, and facial balancing in Knoxville and Farragut, TN. Natural volume restoration at Sarah Hitchcox Aesthetics.',
		content: `## What Is Filler?

Dermal fillers are injectable treatments designed to restore volume, smooth wrinkles, and enhance facial contours. Made from hyaluronic acid, a naturally occurring substance in the skin, dermal fillers work by attracting and retaining moisture, resulting in a plumper, more youthful appearance. At Sarah Hitchcox Aesthetics, we offer a variety of dermal fillers to address your unique cosmetic concerns and help you achieve your desired look.

## Areas We Can Treat with Filler

- **Cheeks** — As we age, the cheeks can lose volume, leading to a sunken or tired appearance. Dermal fillers can add volume to the cheeks, lifting and contouring the mid-face for a more youthful and vibrant look.
- **Lips** — Enhance the volume, shape, and definition of your lips with dermal fillers. Whether you desire a subtle enhancement or a fuller pout, lip fillers can provide natural-looking results.
- **Chin** — Define and contour your chin with dermal fillers. This treatment can enhance your facial profile, creating a more balanced and harmonious appearance.
- **Jawline** — Sculpt and define the jawline for a sharper, more contoured profile using strategic filler placement.
- **Under Eyes** — Soften dark hollows and tired-looking under-eye areas with carefully placed filler for a refreshed appearance.
- **Nasolabial Folds** — Smooth the lines that run from the nose to the corners of the mouth for a more youthful expression.

## Benefits of Filler

- **Non-Surgical** — Dermal filler treatments are minimally invasive with little to no downtime.
- **Immediate Results** — You can see the effects of the treatment immediately, with full results typically appearing within a few days.
- **Customizable** — Our experienced practitioners tailor each treatment to your specific needs and aesthetic goals, ensuring natural-looking results.
- **Long-Lasting** — Depending on the type of filler and the area treated, results can last from several months to up to two years.

## Why Choose Sarah Hitchcox Aesthetics?

At Sarah Hitchcox Aesthetics, we are committed to helping you look and feel your best. Our skilled team will work with you to develop a personalized treatment plan that addresses your concerns and enhances your natural beauty. Please contact us to schedule your consultation and discover the transformative power of dermal fillers.`,
		parent: 'injectables',
		children: [
			'filler/lip-filler',
			'filler/cheek-filler',
			'filler/chin-filler',
			'filler/jawline-filler',
			'filler/under-eye-filler',
			'filler/nasolabial-folds',
		],
		enabled: true,
		whyChooseTitle: 'Expert Filler Injections in Knoxville & Farragut',
		whyChoose:
			'Sarah Hitchcox Aesthetics is the go-to destination for dermal filler injections in Knoxville and Farragut, TN. Whether you want lip filler, cheek filler, or jawline filler, our artistic approach ensures balanced, natural-looking results.',
		shortDescription:
			'Restore volume and enhance contours with hyaluronic acid dermal fillers.',
		ctaText: 'Book Filler',
		sections: [
			{
				type: 'features-grid',
				title: 'Benefits of Dermal Fillers',
				items: [
					{
						title: 'Instant Volume',
						description: 'See immediate improvements in facial contours.',
						icon: 'zap',
					},
					{
						title: 'Natural Feel',
						description:
							'Advanced HA fillers move naturally with your expressions.',
						icon: 'smile',
					},
					{
						title: 'Long Lasting',
						description: 'Results can last from 6 months up to 2 years.',
						icon: 'clock',
					},
				],
			},
			{
				type: 'faq-accordion',
				title: 'Filler FAQs',
				items: [
					{
						question: 'Does filler hurt?',
						answer:
							'We use numbing cream and fillers with lidocaine to ensure your comfort.',
					},
					{
						question: 'Can filler be reversed?',
						answer:
							'Yes, hyaluronic acid fillers can be dissolved if needed using an enzyme called hyaluronidase.',
					},
					{
						question: 'What happens if I stop getting filler?',
						answer:
							'Your face will gradually return to its pre-treatment appearance as the filler naturally metabolizes.',
					},
				],
			},
		],
		faq: [
			{
				question: 'What areas can be treated with filler?',
				answer:
					'We treat cheeks, lips, chin, jawline, under-eyes, and nasolabial folds with dermal fillers. Each treatment is customized to your facial anatomy and aesthetic goals.',
			},
			{
				question: 'How long do filler results last?',
				answer:
					'Depending on the type of filler and the area treated, results can last from 6 months to up to 2 years. Lip filler typically lasts 6-12 months, while cheek and jawline filler can last 12-24 months.',
			},
			{
				question: 'Is there downtime after filler?',
				answer:
					'Downtime is minimal. Some swelling, redness, or bruising may occur and typically resolves within a few days. Most clients return to normal activities immediately.',
			},
		],
	},

	skinvive: {
		path: 'skinvive',
		name: 'SkinVive',
		tagline: 'for skin hydration and glow',
		title: 'SkinVive | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Juvederm SkinVive injectable for deep skin hydration, smoother texture, and a radiant glow. FDA-approved. Available in Knoxville and Farragut, TN.',
		content: `## What Is Juvederm SkinVive?

Juvederm SkinVive is a cutting-edge treatment designed to enhance skin hydration, smoothness, and overall appearance. This injectable dermal filler utilizes micro-droplet hyaluronic acid to deliver deep hydration, providing a radiant and youthful complexion. Ideal for those seeking to improve skin texture and appearance without extensive downtime, Juvederm SkinVive offers a non-invasive solution for rejuvenated skin.

Unlike traditional fillers that add volume, SkinVive works differently by depositing tiny amounts of hyaluronic acid beneath the skin surface, giving your complexion a natural luminosity that skincare alone cannot achieve. The result is smoother, more hydrated skin with a healthy, light-reflecting glow that looks great with or without makeup.

## Who Is SkinVive For?

SkinVive is suitable for all skin tones and types. If you feel your skin looks dull, dehydrated, or lacks that "bounce," this treatment is the perfect solution. It pairs beautifully with other treatments like Botox for a comprehensive refresh. Results are typically noticeable immediately after treatment, with peak results appearing about a month later as the skin fully absorbs the hyaluronic acid. One treatment provides lasting hydration and radiance for up to six months.`,
		parent: 'injectables',
		enabled: true,
		whyChooseTitle: 'Premier SkinVive Provider in Knoxville & Farragut',
		whyChoose:
			'Experience SkinVive at Sarah Hitchcox Aesthetics, your trusted provider for Juvederm SkinVive in Knoxville and Farragut. This innovative skin hydration treatment delivers a radiant, dewy glow that topical products simply cannot match.',
		shortDescription:
			'Micro-droplet hyaluronic acid for deep hydration and a lasting radiant glow.',
		ctaText: 'Book SkinVive',
		sections: [
			{
				type: 'features-grid',
				title: 'Key Benefits of SkinVive',
				items: [
					{
						title: 'Deep Hydration',
						description: 'Increases skin hydration for lasting smoothness.',
						icon: 'droplet',
					},
					{
						title: 'Radiant Glow',
						description: 'Improves light reflection for a healthy glow.',
						icon: 'sun',
					},
					{
						title: 'Lasting Results',
						description: 'Enjoy improved skin quality for up to 6 months.',
						icon: 'calendar',
					},
				],
			},
		],
		faq: [
			{
				question: 'What is Juvederm SkinVive?',
				answer:
					'Juvederm SkinVive is an injectable treatment that uses micro-droplet hyaluronic acid to deeply hydrate the skin and improve texture. It helps in achieving a smoother and more radiant complexion.',
			},
			{
				question: 'Is Juvederm SkinVive painful?',
				answer:
					'Patients might experience mild discomfort during the injection, but a topical numbing cream is applied beforehand to minimize any pain.',
			},
			{
				question:
					'How long does it take to see results from Juvederm SkinVive?',
				answer:
					'Results are typically noticeable immediately after the treatment, with peak results generally appearing about a month later as the skin fully absorbs the hyaluronic acid.',
			},
			{
				question: 'What are the side effects of Juvederm SkinVive?',
				answer:
					'Common side effects include redness, swelling, and mild bruising at the injection site, which usually subside within a few days.',
			},
			{
				question: 'Can Juvederm SkinVive be done on all skin types?',
				answer: 'Yes, Juvederm SkinVive is safe for all skin types.',
			},
			{
				question: 'How often can I undergo Juvederm SkinVive treatments?',
				answer:
					'It is generally recommended to wait a minimum of 6 months between treatments, depending on individual skin needs and desired results.',
			},
			{
				question: 'Is Juvederm SkinVive FDA approved?',
				answer:
					'Yes, Juvederm SkinVive is FDA approved for individuals 21 and older.',
			},
		],
	},

	jeuveau: {
		path: 'jeuveau',
		name: 'Jeuveau',
		tagline: 'for frown lines and wrinkles',
		title: 'Jeuveau | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Jeuveau (Newtox) injections for frown lines and wrinkles in Knoxville and Farragut, TN. A modern alternative to Botox at Sarah Hitchcox Aesthetics.',
		content: `Jeuveau, sometimes called "Newtox," is an FDA-approved injectable neurotoxin designed specifically for cosmetic use. Like Botox, it temporarily relaxes the muscles that cause dynamic wrinkles — but Jeuveau was developed from the ground up as a cosmetic product, not repurposed from a medical one.

## How Jeuveau Compares to Botox

Jeuveau contains prabotulinumtoxinA, while Botox contains onabotulinumtoxinA. Both work by blocking nerve signals to the muscles, reducing wrinkle-causing contractions. Many patients find Jeuveau kicks in slightly faster (as early as 2-3 days), and it is often priced more competitively. Results last approximately 3-4 months, similar to Botox.

## Who Is Jeuveau For?

Jeuveau is FDA-approved for moderate to severe glabellar lines (frown lines between the eyebrows), but it is commonly used off-label for the same areas as Botox — forehead lines, crow's feet, and more. It is an excellent option for patients who want to try an alternative to Botox or who are looking for competitive pricing without compromising results.

## Treatment Experience

A Jeuveau session takes just 10-15 minutes. Sarah uses precise injection techniques to target the specific muscles causing your wrinkles while preserving natural facial expression. There is no downtime, and most patients return to their normal activities immediately.`,
		parent: 'injectables',
		enabled: true,
		shortDescription:
			'Modern Botox alternative for frown lines — designed specifically for cosmetic use.',
		ctaText: 'Book Jeuveau',
		sections: [
			{
				type: 'features-grid',
				title: 'Key Benefits of Jeuveau Injections',
				items: [
					{
						title: 'Purpose-Built',
						description:
							'Designed from the start for cosmetic use, not repurposed from a medical product.',
					},
					{
						title: 'Fast Results',
						description:
							'Many patients notice results in as little as 2-3 days after treatment.',
					},
					{
						title: 'Competitive Pricing',
						description:
							'Often priced lower than Botox while delivering comparable results.',
					},
				],
			},
		],
	},

	dysport: {
		path: 'dysport',
		name: 'Dysport',
		tagline: 'for natural wrinkle smoothing',
		title: 'Dysport | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Dysport injections for wrinkles and fine lines in Knoxville and Farragut, TN. Natural-looking results with a softer spread at Sarah Hitchcox Aesthetics.',
		content: `Dysport is an FDA-approved injectable neurotoxin that smooths moderate to severe frown lines and wrinkles. It contains abobotulinumtoxinA and works similarly to Botox, but with a slightly different formulation that gives it unique characteristics preferred by many patients and injectors.

## How Dysport Differs from Botox

Dysport has a smaller molecular size, which means it tends to spread more easily across a treatment area. This makes it particularly effective for larger areas like the forehead, where a natural, even result is desired. Some patients find Dysport produces a softer, more natural look compared to Botox. Results also tend to kick in faster — often within 2-3 days versus 5-7 for Botox.

## Best Uses for Dysport

While Dysport is FDA-approved for glabellar lines, it is commonly used for forehead lines, crow's feet, and other dynamic wrinkles. Its spreading properties make it an excellent choice for patients who want a subtle, natural result over a larger area. Sarah will evaluate your facial anatomy and discuss whether Dysport or another neurotoxin is the best fit for your goals.

## What to Expect

Treatment takes about 10-15 minutes with minimal discomfort. There is no downtime, and results typically last 3-4 months. Because Dysport is dosed differently than Botox (more units are needed for an equivalent effect), pricing is adjusted accordingly — so the cost per treatment is comparable.`,
		parent: 'injectables',
		enabled: true,
		shortDescription:
			'Softer, natural-looking wrinkle treatment that spreads evenly across larger areas.',
		ctaText: 'Book Dysport',
		sections: [
			{
				type: 'features-grid',
				title: 'Key Benefits of Dysport Treatment',
				items: [
					{
						title: 'Natural Spread',
						description:
							'Smaller molecules spread more evenly for a softer, natural-looking result.',
					},
					{
						title: 'Quick Onset',
						description:
							'Results often visible within 2-3 days, faster than many alternatives.',
					},
					{
						title: 'Ideal for Larger Areas',
						description:
							'The even spread makes Dysport excellent for forehead and larger treatment zones.',
					},
				],
			},
			{
				type: 'faq-accordion',
				title: 'Dysport Frequently Asked Questions',
				items: [
					{
						question: 'Is Dysport better than Botox?',
						answer:
							'Neither is objectively better — they work differently and some patients prefer one over the other. Dysport spreads more and may look more natural on larger areas, while Botox may be preferred for smaller, more precise treatments.',
					},
					{
						question: 'How many units of Dysport do I need?',
						answer:
							'Dysport is dosed differently than Botox. A typical conversion is roughly 2.5-3 Dysport units for every 1 Botox unit, but pricing is adjusted so the cost per treatment area is comparable.',
					},
					{
						question: 'How long does Dysport last?',
						answer:
							'Results typically last 3-4 months, similar to Botox. Some patients report Dysport lasting slightly longer, though individual experiences vary.',
					},
				],
			},
		],
	},

	kybella: {
		path: 'kybella',
		name: 'Kybella',
		tagline: 'for submental fat reduction',
		title: 'Kybella | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Kybella FDA-approved injectable to reduce double chin fat without surgery. Non-surgical jawline contouring in Knoxville and Farragut, TN. Sarah Hitchcox Aesthetics.',
		content: `## What Is Kybella?

KYBELLA is an FDA-approved injectable treatment designed to reduce submental fullness, commonly referred to as a "double chin." This non-surgical solution helps contour and define the jawline, providing a slimmer, more youthful appearance.

KYBELLA contains synthetic deoxycholic acid, a naturally occurring molecule in the body that helps break down and absorb dietary fat. When injected into the fat beneath the chin, KYBELLA destroys fat cells, preventing them from storing or accumulating fat in the future. Once the fat cells are destroyed, they are gone for good — maintaining a stable weight helps preserve results over time.

## What to Expect

Most patients require 2-4 sessions, spaced 4 weeks apart, to achieve optimal results. Each KYBELLA vial is $600, and usually 1-3 vials are needed per treatment for moderate to severe submental fat. Downtime is minimal — swelling, redness, or bruising may occur after the treatment and typically subsides within a week.

KYBELLA is ideal for adults with moderate to severe fat under the chin who prefer a non-surgical approach to contouring.`,
		parent: 'injectables',
		enabled: true,
		whyChooseTitle: 'Expert Kybella Provider in Knoxville & Farragut',
		whyChoose:
			'Sarah Hitchcox Aesthetics offers expert Kybella treatments for double chin reduction in Knoxville and Farragut, TN. Our precise injections target stubborn submental fat that resists diet and exercise, giving you a sleeker, more defined jawline.',
		shortDescription:
			'FDA-approved injectable that permanently destroys fat cells under the chin.',
		ctaText: 'Book Kybella',
		sections: [
			{
				type: 'features-grid',
				title: 'Kybella Advantages',
				items: [
					{
						title: 'Permanent Removal',
						description: 'Destroys fat cells so they cannot store fat again.',
						icon: 'trash',
					},
					{
						title: 'Non-Surgical',
						description:
							'No incisions, stitches, or general anesthesia required.',
						icon: 'shield',
					},
					{
						title: 'Defined Profile',
						description: 'Sculpts the jawline for a sharper appearance.',
						icon: 'user',
					},
				],
			},
		],
		faq: [
			{
				question: 'What is KYBELLA made of?',
				answer:
					'KYBELLA contains synthetic deoxycholic acid, a naturally occurring molecule in the body that helps break down and absorb dietary fat.',
			},
			{
				question: 'How does KYBELLA work?',
				answer:
					'When injected into the fat beneath the chin, KYBELLA destroys fat cells, preventing them from storing or accumulating fat in the future.',
			},
			{
				question: 'How many treatments are needed?',
				answer:
					'Most patients require 2-4 sessions, spaced 4 weeks apart, to achieve optimal results.',
			},
			{
				question: 'What is the cost of KYBELLA?',
				answer:
					'Each KYBELLA vial is $600, usually 1-3 vials are needed per treatment for moderate to severe submental (under the chin) fat.',
			},
			{
				question: 'Is there downtime?',
				answer:
					'Downtime is minimal. Swelling, redness, or bruising may occur after the treatment and typically subsides within a week.',
			},
			{
				question: 'Who is a good candidate for KYBELLA?',
				answer:
					'KYBELLA is ideal for adults with moderate to severe fat under the chin who prefer a non-surgical approach to contouring.',
			},
			{
				question: 'How long do the results last?',
				answer:
					'Once the fat cells are destroyed, they are gone for good. Maintaining a stable weight helps preserve results over time.',
			},
		],
	},

	// ═══════════════════════════════════════════════
	// BOTOX – SUB-SERVICE PAGES
	// ═══════════════════════════════════════════════

	'botox/forehead-lines': {
		path: 'botox/forehead-lines',
		name: 'Forehead Lines',
		tagline: 'for smooth forehead skin',
		title: 'Botox for Forehead Lines | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Botox for forehead lines in Knoxville and Farragut, TN. Smooth horizontal forehead wrinkles with natural-looking results at Sarah Hitchcox Aesthetics.',
		content: `Horizontal forehead lines are one of the most common concerns that bring patients to our office. These lines develop over time from repeated muscle movements like raising your eyebrows, and they can make you look older or more stressed than you feel. Botox is the gold standard treatment for reducing forehead lines, and it works by temporarily relaxing the frontalis muscle that creates these creases.

## How It Works

During your treatment, Sarah will carefully assess your forehead muscles and place precise injections to smooth the lines while preserving your natural ability to express. The goal is never a "frozen" look — we aim for a result that softens the lines and leaves you looking refreshed and relaxed. Most patients see results within 3-7 days, with full smoothing at the two-week mark.

## What to Expect

A forehead Botox session typically takes just 10-15 minutes. There is no downtime, and most patients return to their normal activities immediately. Results last approximately 3-4 months, and with regular maintenance, many patients find their forehead lines become less pronounced over time as the muscles gradually weaken from consistent treatment.`,
		parent: 'botox',
		enabled: true,
		shortDescription:
			'Smooth horizontal forehead wrinkles for a relaxed, youthful appearance.',
		ctaText: 'Book Forehead Botox',
		sections: [
			{
				type: 'features-grid',
				title: 'Key Benefits of Botox for Forehead Lines',
				items: [
					{
						title: 'Smooth Appearance',
						description: 'Reduces horizontal lines for a smoother forehead.',
						icon: 'smile',
					},
					{
						title: 'Preventative',
						description: 'Prevents static lines from etching into the skin.',
						icon: 'shield',
					},
					{
						title: 'Expressive',
						description: 'Maintains natural brow movement and expression.',
						icon: 'user',
					},
				],
			},
		],
	},

	'botox/frown-lines': {
		path: 'botox/frown-lines',
		name: 'Frown Lines',
		tagline: 'for the "11 lines" between brows',
		title: 'Botox for Frown Lines | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Botox for frown lines and "11 lines" between the eyebrows in Knoxville and Farragut, TN. Expert treatment at Sarah Hitchcox Aesthetics.',
		content: `Frown lines, also known as glabellar lines or "11 lines," are the vertical creases that form between your eyebrows when you concentrate, squint, or furrow your brow. Over time, these dynamic lines can become etched into the skin and visible even at rest, giving you an unintentionally angry or worried expression. Botox is specifically FDA-approved for treating glabellar lines and is one of the most effective solutions available.

## Treatment Approach

Sarah targets the corrugator and procerus muscles responsible for creating frown lines with precise, measured injections. The key to natural-looking results is understanding the balance between these muscles — too much relaxation can affect brow shape, while too little leaves the lines visible. Our conservative approach ensures you still look like yourself, just without the harsh vertical creases.

## Results and Maintenance

You can expect to see improvement within 3-5 days, with optimal smoothing by two weeks. Frown line Botox typically lasts 3-4 months. Many patients find that consistent treatment over time helps prevent the lines from deepening into permanent static wrinkles, making this an excellent preventative strategy as well as a corrective one.`,
		parent: 'botox',
		enabled: true,
		shortDescription:
			'Soften vertical "11 lines" between the eyebrows for a calmer expression.',
		ctaText: 'Book Frown Line Botox',
		sections: [
			{
				type: 'features-grid',
				title: 'Key Benefits of Frown Line Botox',
				items: [
					{
						title: 'Look Rested',
						description: 'Eliminates the unintentional "angry" look.',
						icon: 'smile',
					},
					{
						title: 'Quick Fix',
						description: 'Treatment takes just minutes with no downtime.',
						icon: 'clock',
					},
					{
						title: 'Softened Expression',
						description: 'Creates a more approachable, relaxed appearance.',
						icon: 'user',
					},
				],
			},
		],
	},

	'botox/crows-feet': {
		path: 'botox/crows-feet',
		name: "Crow's Feet",
		tagline: 'for lines around the eyes',
		title: "Botox for Crow's Feet | Knoxville | SHA",
		metaDescription:
			"Botox for crow's feet and fine lines around the eyes in Knoxville and Farragut, TN. Diminish eye wrinkles at Sarah Hitchcox Aesthetics.",
		content: `Crow's feet are the fine lines that fan out from the outer corners of your eyes, often most visible when you smile or laugh. While these lines are a natural part of aging and expression, many patients find that prominent crow's feet make them look older or more tired than they feel. Botox is FDA-approved for treating crow's feet and is one of the most requested treatments at our practice.

## How We Treat Crow's Feet

The orbicularis oculi muscle that encircles your eye is responsible for creating crow's feet. Sarah places small, strategic injections around the outer eye area to relax the portions of this muscle that cause the most prominent creasing. The treatment is quick, precise, and designed to soften the lines while maintaining your natural smile and eye expression.

## What Makes This Treatment Special

Crow's feet Botox is often one of the first treatments patients try because the results are so immediately noticeable. Friends and family may not be able to pinpoint what has changed, but they will tell you that you look refreshed and well-rested. Results appear within a few days and typically last 3-4 months.`,
		parent: 'botox',
		enabled: true,
		shortDescription:
			'Diminish fine lines around the eyes for a brighter, more youthful look.',
		ctaText: "Book Crow's Feet Botox",
		sections: [
			{
				type: 'features-grid',
				title: "Key Benefits of Botox for Crow's Feet",
				items: [
					{
						title: 'Bright Eyes',
						description: 'Opens up the eye area for a more youthful look.',
						icon: 'sun',
					},
					{
						title: 'Youthful Smile',
						description: 'Smile with confidence without deep eye wrinkles.',
						icon: 'smile',
					},
					{
						title: 'Gentle Treatment',
						description: 'Minimal discomfort for a sensitive area.',
						icon: 'feather',
					},
				],
			},
		],
	},

	'botox/lip-flip': {
		path: 'botox/lip-flip',
		name: 'Lip Flip',
		tagline: 'for a fuller upper lip',
		title: 'Botox Lip Flip | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Botox lip flip for a subtly fuller upper lip without filler in Knoxville and Farragut, TN. Quick, natural results at Sarah Hitchcox Aesthetics.',
		content: `## What Is a Botox Lip Flip?

A Botox lip flip is a subtle, non-surgical technique that creates the appearance of a fuller upper lip without the use of dermal filler. By placing a small amount of Botox into the orbicularis oris muscle along the upper lip border, the muscle relaxes slightly, allowing the lip to "flip" outward and reveal more of the pink vermilion. The result is a natural-looking enhancement that adds a soft pout without adding volume.

## Lip Flip vs. Lip Filler

The lip flip is an excellent option for patients who want a subtle change or who are not ready to commit to lip filler. While filler adds volume directly, the lip flip simply adjusts the position of the existing lip tissue. Many patients choose to combine both treatments for a comprehensive lip enhancement — the flip adjusts the shape while the filler adds fullness.

## What to Expect

The lip flip requires only 2-4 units of Botox and takes just a few minutes to perform. You may notice a slight difference within a few days, with full results appearing at the two-week mark. Results typically last 6-8 weeks, somewhat shorter than other Botox applications due to the active nature of the lip muscles. There is no significant downtime, though you may experience minor swelling for a day or two.`,
		parent: 'botox',
		enabled: true,
		shortDescription:
			'A subtle technique that creates a fuller-looking upper lip without filler.',
		ctaText: 'Book Lip Flip',
		sections: [
			{
				type: 'features-grid',
				title: 'Key Benefits of Botox Lip Flip',
				items: [
					{
						title: 'Subtle Pout',
						description: 'Enhances the upper lip without adding volume.',
						icon: 'smile',
					},
					{
						title: 'No Filler',
						description: 'Uses only Botox for a natural, lightweight feel.',
						icon: 'droplet',
					},
					{
						title: 'Quick Procedure',
						description: 'Takes less than 10 minutes to perform.',
						icon: 'clock',
					},
				],
			},
		],
	},

	'botox/bunny-lines': {
		path: 'botox/bunny-lines',
		name: 'Bunny Lines',
		tagline: 'for lines on the nose',
		title: 'Botox for Bunny Lines | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Botox for bunny lines on the nose in Knoxville and Farragut, TN. Smooth wrinkles that appear when smiling at Sarah Hitchcox Aesthetics.',
		content: `Bunny lines are the diagonal wrinkles that appear on the sides of the nose when you smile, laugh, or scrunch your face. Named for the way rabbits twitch their noses, these lines are caused by the contraction of the nasalis muscle. While bunny lines can be charming, some patients find them bothersome — especially when they become visible at rest or when other areas of the face have already been treated with Botox, making bunny lines more noticeable by comparison.

## Treatment Details

Treating bunny lines is quick and straightforward. Sarah places a small number of Botox units — typically 2-4 per side — into the nasalis muscle on each side of the nose. The injections soften the scrunching motion without affecting your smile or other expressions. This treatment is frequently added on to a broader Botox session targeting the forehead, frown lines, or crow's feet.

## Results

Results begin to appear within a few days, with full smoothing by two weeks. Bunny line Botox typically lasts 3-4 months, and many patients include it as part of their regular maintenance routine alongside other facial Botox areas.`,
		parent: 'botox',
		enabled: true,
		shortDescription:
			'Smooth the diagonal wrinkles that appear on the nose when you smile.',
		ctaText: 'Book Bunny Lines Botox',
		sections: [
			{
				type: 'features-grid',
				title: 'Key Benefits of Bunny Lines Botox',
				items: [
					{
						title: 'Smooth Nose',
						description: 'Eliminates diagonal wrinkles on the nose.',
						icon: 'check-circle',
					},
					{
						title: 'Natural Smile',
						description: 'Smile freely without nose scrunching.',
						icon: 'smile',
					},
					{
						title: 'Refined Look',
						description: 'Completes a full-face rejuvenation.',
						icon: 'star',
					},
				],
			},
		],
	},

	'botox/gummy-smile': {
		path: 'botox/gummy-smile',
		name: 'Gummy Smile',
		tagline: 'for balanced smile aesthetics',
		title: 'Botox for Gummy Smile | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Botox for gummy smile correction in Knoxville and Farragut, TN. Reduce excessive gum exposure for a balanced smile at Sarah Hitchcox Aesthetics.',
		content: `A gummy smile occurs when an excessive amount of gum tissue shows above your upper teeth when you smile. This is often caused by a hyperactive levator labii superioris muscle that pulls the upper lip too high. Botox offers a simple, non-surgical solution by relaxing this muscle just enough to reduce the amount of gum that shows, resulting in a more balanced and aesthetically pleasing smile.

## How the Treatment Works

Sarah carefully identifies the precise injection points along the levator labii superioris muscle, typically placing 2-4 units per side. The goal is to subtly lower the resting position of the upper lip when smiling so that less gum is visible, without affecting your ability to smile naturally or speak comfortably. The injection takes just a few minutes and requires no anesthesia.

## Results and Considerations

Results typically appear within 3-7 days and last 3-4 months. Many patients are delighted by how such a small amount of Botox can dramatically improve their smile confidence. This treatment can be performed alone or alongside other Botox treatments. If you have been self-conscious about showing too much gum when you smile, this is a quick, effective option worth exploring.`,
		parent: 'botox',
		enabled: true,
		shortDescription:
			'Reduce excessive gum exposure when smiling for a more balanced look.',
		ctaText: 'Book Gummy Smile Botox',
		sections: [
			{
				type: 'features-grid',
				title: 'Key Benefits of Botox for Gummy Smile',
				items: [
					{
						title: 'Balanced Smile',
						description: 'Reduces gum exposure for better aesthetics.',
						icon: 'smile',
					},
					{
						title: 'Confidence Boost',
						description: 'Smile widely without self-consciousness.',
						icon: 'heart',
					},
					{
						title: 'Fast Results',
						description: 'See improvement in as little as 3 days.',
						icon: 'zap',
					},
				],
			},
		],
	},

	'botox/chin-dimpling': {
		path: 'botox/chin-dimpling',
		name: 'Chin Dimpling',
		tagline: 'for smoother chin texture',
		title: 'Botox for Chin Dimpling | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Botox for chin dimpling and "orange peel" chin texture in Knoxville and Farragut, TN. Smooth, refined results at Sarah Hitchcox Aesthetics.',
		content: `Chin dimpling, sometimes called "peau d'orange" or "orange peel" chin, occurs when the mentalis muscle in the chin contracts and creates a bumpy, uneven texture on the chin surface. This can happen when speaking, making certain facial expressions, or even at rest in some patients. The dimpled appearance can be a source of self-consciousness, but Botox offers a simple and effective solution.

## Treatment Approach

By placing a small amount of Botox — typically 4-8 units — into the mentalis muscle, Sarah can relax the overactive contractions that cause the dimpled texture. The result is a smoother, more refined chin surface. This treatment pairs well with chin filler for patients who want both improved texture and enhanced chin projection or definition.

## What to Expect

The chin dimpling Botox treatment takes only a few minutes. You will notice the chin surface beginning to smooth within a few days, with full results by two weeks. The effects typically last 3-4 months. Since the mentalis muscle is not heavily involved in everyday expressions, most patients find this treatment has minimal impact on their facial movement while providing significant aesthetic improvement.`,
		parent: 'botox',
		enabled: true,
		shortDescription:
			'Smooth bumpy "orange peel" chin texture for a refined appearance.',
		ctaText: 'Book Chin Dimpling Botox',
		sections: [
			{
				type: 'features-grid',
				title: 'Key Benefits of Chin Dimpling Botox',
				items: [
					{
						title: 'Smooth Texture',
						description: 'Eliminates "orange peel" chin texture.',
						icon: 'droplet',
					},
					{
						title: 'Refined Chin',
						description: 'Creates a smoother, more polished chin.',
						icon: 'check-circle',
					},
					{
						title: 'Simple Solution',
						description: 'A quick injection with lasting results.',
						icon: 'zap',
					},
				],
			},
		],
	},

	'botox/brow-lift': {
		path: 'botox/brow-lift',
		name: 'Brow Lift',
		tagline: 'for an elevated brow arch',
		title: 'Botox Brow Lift | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Non-surgical Botox brow lift in Knoxville and Farragut, TN. Subtly lift and open the eye area at Sarah Hitchcox Aesthetics. Natural-looking results.',
		content: `A Botox brow lift is a non-surgical technique that subtly lifts the tail of the eyebrow to create a more open, refreshed eye area. As we age, the brow can droop due to gravity and muscle changes, causing the eyes to look heavy or tired. By strategically placing Botox in the muscles that pull the brow downward (primarily the lateral orbicularis oculi), we allow the frontalis muscle to lift the brow unopposed, creating a subtle but noticeable elevation.

## The Art of the Brow Lift

This treatment requires a nuanced understanding of brow anatomy and aesthetics. Sarah evaluates your natural brow shape, position, and the balance between the muscles that elevate and depress the brow. The injection placement is carefully customized — a few units in the right spots can open up the entire eye area, making you look more awake and refreshed without any surgical intervention.

## Results

The Botox brow lift produces subtle results that enhance rather than dramatically change your appearance. You will notice a gentle lift within a few days, with the full effect visible at two weeks. The lift typically lasts 3-4 months. Many patients combine a brow lift with forehead Botox and crow's feet treatment for a comprehensive upper-face refresh.`,
		parent: 'botox',
		enabled: true,
		shortDescription:
			'Subtly lift the brow for a more open, refreshed eye area without surgery.',
		ctaText: 'Book Brow Lift Botox',
		sections: [
			{
				type: 'features-grid',
				title: 'Key Benefits of Botox Brow Lift',
				items: [
					{
						title: 'Open Eyes',
						description: 'Makes eyes appear larger and more awake.',
						icon: 'sun',
					},
					{
						title: 'Non-Surgical',
						description: 'Achieve a lift without surgery or downtime.',
						icon: 'shield',
					},
					{
						title: 'Refreshed Look',
						description: 'Subtle elevation for a youthful arch.',
						icon: 'star',
					},
				],
			},
		],
	},

	// ═══════════════════════════════════════════════
	// FILLER – SUB-SERVICE PAGES
	// ═══════════════════════════════════════════════

	'filler/lip-filler': {
		path: 'filler/lip-filler',
		name: 'Lip Filler',
		tagline: 'for volume and definition',
		title: 'Lip Filler | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Lip filler for natural-looking volume, shape, and definition in Knoxville and Farragut, TN. Expert lip injections at Sarah Hitchcox Aesthetics.',
		content: `Lip filler is one of our most popular treatments, and for good reason. Whether you are looking for a subtle hydration boost, enhanced definition along the lip border, or a fuller pout, hyaluronic acid lip filler can be customized to achieve your ideal look. Sarah takes a careful, artistic approach to lip enhancement, ensuring that your results complement your overall facial proportions and look completely natural.

## What to Expect

During your lip filler appointment, a topical numbing cream is applied for comfort, and most modern lip fillers also contain lidocaine for additional pain management. Sarah will discuss your goals — whether you want more volume on the upper lip, a defined cupid's bow, or overall fullness — and then strategically inject small amounts of filler to build the result gradually. The entire appointment takes about 30 minutes.

## Results and Aftercare

You will see immediate results, though mild swelling is normal for the first 24-48 hours. The final result settles within about two weeks. Lip filler typically lasts 6-12 months depending on the product used and your individual metabolism. We recommend avoiding strenuous exercise and excessive heat for 24 hours after treatment. Touch-up appointments can be scheduled to maintain your desired look.`,
		parent: 'filler',
		enabled: true,
		shortDescription:
			'Enhance lip volume, shape, and definition with natural-looking filler.',
		ctaText: 'Book Lip Filler',
		sections: [
			{
				type: 'features-grid',
				title: 'Key Benefits of Lip Filler',
				items: [
					{
						title: 'Volume',
						description: 'Add fullness for a plush, youthful pout.',
						icon: 'plus-circle',
					},
					{
						title: 'Definition',
						description: "Sharpen the vermilion border and cupid's bow.",
						icon: 'edit-2',
					},
					{
						title: 'Hydration',
						description: 'HA fillers hydrate lips from the inside out.',
						icon: 'droplet',
					},
				],
			},
		],
	},

	'filler/cheek-filler': {
		path: 'filler/cheek-filler',
		name: 'Cheek Filler',
		tagline: 'for mid-face volume and lift',
		title: 'Cheek Filler | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Cheek filler to restore mid-face volume and create a lifted, youthful contour in Knoxville and Farragut, TN. Sarah Hitchcox Aesthetics.',
		content: `As we age, the cheeks are often one of the first areas to lose volume, leading to a flattened or sunken mid-face that can make you look tired or older than you feel. Cheek filler restores this lost volume and creates a natural lift that rejuvenates the entire face. Using premium hyaluronic acid fillers designed for the mid-face, Sarah sculpts and contours the cheek area to enhance your natural bone structure and restore a youthful, vibrant appearance.

## The Lift Effect

Strategically placed cheek filler does more than just add volume — it creates an upward lifting effect that can improve the appearance of nasolabial folds, under-eye hollows, and even jowling. By restoring the structural support of the mid-face, we address multiple concerns with a single treatment area. This is why cheek filler is often the cornerstone of a comprehensive facial rejuvenation plan.

## Treatment Details

Cheek filler treatments typically take 20-30 minutes. Sarah uses advanced injection techniques, including the option of micro-cannulas for reduced bruising. Results are immediate, though some swelling may be present for the first few days. Cheek filler is one of the longest-lasting filler treatments, with results typically persisting for 12-24 months.`,
		parent: 'filler',
		enabled: true,
		shortDescription:
			'Restore mid-face volume and lift for a youthful, contoured appearance.',
		ctaText: 'Book Cheek Filler',
		sections: [
			{
				type: 'features-grid',
				title: 'Benefits of Cheek Filler Treatment',
				items: [
					{
						title: 'Lift',
						description: 'Lifts the lower face for a rejuvenated look.',
						icon: 'arrow-up',
					},
					{
						title: 'Contour',
						description: 'Creates high, defined cheekbones.',
						icon: 'check-circle',
					},
					{
						title: 'Youthful Volume',
						description: 'Restores lost volume in the mid-face.',
						icon: 'smile',
					},
				],
			},
		],
	},

	'filler/chin-filler': {
		path: 'filler/chin-filler',
		name: 'Chin Filler',
		tagline: 'for profile definition',
		title: 'Chin Filler | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Chin filler for profile enhancement and facial balancing in Knoxville and Farragut, TN. Non-surgical chin augmentation at Sarah Hitchcox Aesthetics.',
		content: `Chin filler is a non-surgical way to enhance your facial profile by adding projection, length, or definition to the chin. A well-proportioned chin plays a critical role in overall facial harmony, and even a small adjustment can dramatically improve how your profile looks from every angle. Sarah uses structural hyaluronic acid fillers to sculpt the chin area according to your unique anatomy and aesthetic goals.

## Who Benefits from Chin Filler?

Chin filler is ideal for patients who have a recessed or weak chin, those who want to improve their side profile, or anyone seeking better facial proportions without surgery. It can also help define the separation between the chin and neck for a more sculpted look. Many patients combine chin filler with jawline filler for a comprehensive lower-face contouring effect.

## The Treatment Experience

A chin filler appointment typically takes 15-20 minutes. Sarah may use a needle or cannula depending on the injection plan. Because the chin area has relatively thick skin and less sensitivity than the lips, most patients find the treatment comfortable with topical numbing alone. Results are visible immediately and typically last 12-18 months. Some mild swelling or tenderness is normal for a few days post-treatment.`,
		parent: 'filler',
		enabled: true,
		shortDescription:
			'Enhance your chin projection and profile with non-surgical filler.',
		ctaText: 'Book Chin Filler',
		sections: [
			{
				type: 'features-grid',
				title: 'Key Benefits of Chin Filler',
				items: [
					{
						title: 'Projection',
						description: 'Improves weak chins for a stronger profile.',
						icon: 'arrow-right',
					},
					{
						title: 'Balance',
						description: 'Harmonizes facial proportions.',
						icon: 'git-commit',
					},
					{
						title: 'Definition',
						description: 'Creates a distinct separation between face and neck.',
						icon: 'check',
					},
				],
			},
		],
	},

	'filler/jawline-filler': {
		path: 'filler/jawline-filler',
		name: 'Jawline Filler',
		tagline: 'for a sculpted jawline',
		title: 'Jawline Filler | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Jawline filler for a defined, sculpted jaw contour in Knoxville and Farragut, TN. Non-surgical jawline contouring at Sarah Hitchcox Aesthetics.',
		content: `A defined jawline is one of the most sought-after aesthetic features, and dermal filler makes it achievable without surgery. Jawline filler involves placing a firm, structural hyaluronic acid filler along the jawline to create sharper definition, reduce the appearance of jowling, and improve the overall contour of the lower face. Sarah takes a precise, layered approach to jawline enhancement, building definition gradually for a natural, sculpted result.

## What Jawline Filler Can Address

- **Weak or undefined jawline** — Adding projection and structure where the jaw lacks natural definition.
- **Early jowling** — Providing structural support to counteract the downward pull of gravity on the lower face.
- **Asymmetry** — Correcting mild jawline asymmetry for a more balanced facial appearance.
- **Pre-jowl sulcus** — Filling the indentation that can form between the chin and the jowl area.

## Results and Longevity

Jawline filler results are visible immediately after treatment, with the final result settling within one to two weeks as any swelling subsides. Because the jaw area uses firmer filler products, results tend to last 12-24 months. The treatment takes approximately 20-30 minutes and pairs beautifully with chin filler for comprehensive lower-face contouring.`,
		parent: 'filler',
		enabled: true,
		shortDescription:
			'Define and sculpt the jawline with structural filler for a contoured profile.',
		ctaText: 'Book Jawline Filler',
		sections: [
			{
				type: 'features-grid',
				title: 'Key Benefits of Jawline Filler',
				items: [
					{
						title: 'Sharp Contour',
						description: 'Creates a crisp, defined jawline edge.',
						icon: 'scissors',
					},
					{
						title: 'Structure',
						description: 'Adds structural support to the lower face.',
						icon: 'box',
					},
					{
						title: 'Jowl Reduction',
						description: 'Camouflages the appearance of jowls.',
						icon: 'minimize-2',
					},
				],
			},
		],
	},

	'filler/under-eye-filler': {
		path: 'filler/under-eye-filler',
		name: 'Under-Eye Filler',
		tagline: 'for tired-looking hollows',
		title: 'Under-Eye Filler | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Under-eye filler to soften dark hollows and refresh tired-looking eyes in Knoxville and Farragut, TN. Expert treatment at Sarah Hitchcox Aesthetics.',
		content: `Dark under-eye hollows, also known as tear troughs, can make you look perpetually tired, even when you are well-rested. Under-eye filler is a delicate treatment that places a small amount of hyaluronic acid into the tear trough area to smooth the transition between the lower eyelid and the cheek. The result is a refreshed, brighter-eyed appearance that no amount of concealer can replicate.

## A Specialized Skill

The under-eye area is one of the most delicate regions to inject, requiring advanced technique and a thorough understanding of the anatomy. Sarah uses a conservative approach, placing small amounts of filler precisely where needed and building gradually. This minimizes the risk of complications and ensures a natural result. A cannula is often used for this area, which reduces bruising and provides a smoother, more even placement.

## What to Expect

Under-eye filler appointments take about 20-30 minutes. You will see improvement immediately, though minor swelling may be present for a few days. Full results are typically visible within one to two weeks. Under-eye filler generally lasts 9-12 months, and because the under-eye area has less movement than other facial areas, results can sometimes last even longer. This treatment is best suited for patients with volume loss rather than excess skin or puffiness.`,
		parent: 'filler',
		enabled: true,
		shortDescription:
			'Soften dark under-eye hollows for a brighter, more rested appearance.',
		ctaText: 'Book Under-Eye Filler',
		sections: [
			{
				type: 'features-grid',
				title: 'Benefits of Under-Eye Filler Treatment',
				items: [
					{
						title: 'Brighten',
						description: 'Reduces dark shadows for a brighter look.',
						icon: 'sun',
					},
					{
						title: 'Refresh',
						description: 'Look well-rested and alert.',
						icon: 'coffee',
					},
					{
						title: 'Restore Volume',
						description: 'Fills deep hollows and tear troughs.',
						icon: 'droplet',
					},
				],
			},
		],
	},

	'filler/nasolabial-folds': {
		path: 'filler/nasolabial-folds',
		name: 'Nasolabial Folds',
		tagline: 'for smile line softening',
		title: 'Nasolabial Fold Filler | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Dermal filler for nasolabial folds and smile lines in Knoxville and Farragut, TN. Smooth deep lines at Sarah Hitchcox Aesthetics. Natural results.',
		content: `Nasolabial folds are the lines that run from the sides of the nose down to the corners of the mouth, commonly referred to as "smile lines" or "laugh lines." While they are a natural part of facial anatomy, deepening nasolabial folds can create a tired or aged appearance. Dermal filler can soften these lines and restore a smoother, more youthful transition between the cheek and the mouth area.

## Our Approach

Rather than simply filling the fold directly — which can create an unnatural, puffy appearance — Sarah often takes a comprehensive approach. In many cases, restoring volume in the cheeks provides an upward lift that naturally softens the nasolabial fold from above. When direct treatment of the fold is appropriate, she uses a moderate-density filler and a careful technique to blend the result seamlessly with the surrounding tissue.

## Treatment Details

Nasolabial fold filler treatments take about 15-20 minutes. Results are visible immediately, with final results settling within one to two weeks. Depending on the filler used and the depth of the folds, results typically last 9-18 months. Many patients combine nasolabial fold treatment with cheek filler and/or marionette line treatment for a comprehensive mid-to-lower face rejuvenation.`,
		parent: 'filler',
		enabled: true,
		shortDescription:
			'Soften deep smile lines for a smoother, more youthful expression.',
		ctaText: 'Book Nasolabial Fold Filler',
		sections: [
			{
				type: 'features-grid',
				title: 'Key Benefits of Nasolabial Fold Filler',
				items: [
					{
						title: 'Smooth Transitions',
						description: 'Blends the cheek to mouth area seamlessly.',
						icon: 'activity',
					},
					{
						title: 'Softened Lines',
						description: 'Reduces the depth of smile lines.',
						icon: 'minus',
					},
					{
						title: 'Natural Look',
						description: 'Restores volume without looking puffy.',
						icon: 'smile',
					},
				],
			},
		],
	},

	// ═══════════════════════════════════════════════
	// LASER SERVICES – SERVICE PAGES
	// ═══════════════════════════════════════════════

	'laser-hair-removal': {
		path: 'laser-hair-removal',
		name: 'Laser Hair Removal',
		tagline: 'for smooth, hair-free skin',
		title: 'Laser Hair Removal | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Virtually pain-free laser hair removal for all skin types in Knoxville and Farragut, TN. Face, legs, arms, bikini, and more at Sarah Hitchcox Aesthetics.',
		content: `Experience virtually pain-free hair removal, suitable for all skin types, including darker or tanned skin. Our laser delivers energy gradually and uniformly, ensuring a comfortable treatment. Prior to your appointment, the treatment area should be shaved to allow the laser to effectively target hair follicles. The process is quick, typically taking 15-45 minutes depending on the treatment area. Most clients achieve optimal results after 6-8 sessions, spaced 4-6 weeks apart. Yearly touch-up sessions are recommended to maintain smooth, hair-free skin.

## Service Areas

- **Upper Lip** — Quick and easy hair removal for the upper lip area.
- **Neck or Neck Line** — Smooth and clean neck or neckline, perfect for sensitive skin.
- **Bikini Line** — Gentle and precise hair removal for the bikini line.
- **Full Face** — Comprehensive hair removal for the entire face.
- **Forearms** — Effective hair removal for both forearms.
- **Upper Leg** — Smooth upper legs with painless hair removal.
- **Chest** — Get a smooth, hair-free chest with our advanced laser treatment.
- **Chin** — Targeted hair removal for the chin area.
- **Under Arms** — Enjoy smooth underarms with our effective laser treatment.
- **Abdomen** — Painless hair removal for a smooth abdomen.
- **Brazilian** — Comprehensive hair removal for the Brazilian area.
- **Lower Leg** — Smooth lower legs with effective laser hair removal.
- **Full Arms** — Complete hair removal for the entire arms.
- **Full Legs** — Achieve smooth, hair-free full legs.

## Why Choose Laser Over Shaving or Waxing?

Laser hair removal provides long-lasting results that shaving and waxing simply cannot match. After a series of treatments, most patients experience permanent hair reduction, saving both time and money over a lifetime. The treatment is safe for all skin types and virtually pain-free with our advanced laser technology.`,
		parent: 'laser-services',
		enabled: true,
		whyChooseTitle: 'Best Laser Hair Removal in Knoxville & Farragut',
		whyChoose:
			'Sarah Hitchcox Aesthetics provides safe, effective laser hair removal for all skin types in Knoxville and Farragut, TN. Our advanced laser technology targets unwanted hair at the root for long-lasting smoothness across any body area.',
		shortDescription:
			'Virtually pain-free laser hair removal for all skin types across any body area.',
		ctaText: 'Book Laser Hair Removal',
		sections: [
			{
				type: 'features-grid',
				title: 'Benefits of Laser Hair Removal',
				items: [
					{
						title: 'Virtually Pain-Free',
						description: 'Comfortable treatment for all skin types.',
						icon: 'smile',
					},
					{
						title: 'Save Time',
						description: 'Ditch the daily shaving routine.',
						icon: 'clock',
					},
					{
						title: 'Smooth Skin',
						description: 'Eliminate stubble and ingrown hairs.',
						icon: 'check-circle',
					},
				],
			},
			{
				type: 'faq-accordion',
				title: 'Laser Hair Removal Frequently Asked Questions',
				items: [
					{
						question: 'How many sessions will I need?',
						answer:
							'Most clients achieve optimal results after 6-8 sessions, spaced 4-6 weeks apart. Yearly touch-ups help maintain results.',
					},
					{
						question: 'Is it painful?',
						answer:
							'Our advanced laser technology is designed to be virtually pain-free, often described as a warm sensation or light snap.',
					},
					{
						question: 'Is it permanent?',
						answer:
							'Laser hair removal offers permanent hair reduction. While some fine hair may regrow over time, it is typically much lighter and sparser.',
					},
				],
			},
		],
	},

	'skin-revitalization': {
		path: 'skin-revitalization',
		name: 'Skin Revitalization',
		tagline: 'for tone, texture, and glow',
		title: 'Skin Revitalization | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Laser skin revitalization for fine lines, wrinkles, and uneven texture. Non-ablative laser facials and tone treatments in Knoxville and Farragut, TN.',
		content: `Revitalize your skin with our advanced laser treatment, designed to address signs of aging such as fine lines, wrinkles, and uneven texture. The process promotes collagen production, resulting in smoother, firmer, and more youthful-looking skin. Treatment sessions are quick, often completed within 30-45 minutes, making them easy to fit into your routine. Most clients achieve optimal results after 4-6 sessions, spaced 4 weeks apart. Suitable for all skin types, this non-invasive solution offers radiant and refreshed skin with minimal downtime and impressive results.

## Treatments Available

- **Non-Ablative Laser Facial** — A gentle laser treatment that revitalizes your skin, reducing fine lines and improving overall skin texture.
- **Tone & Texture Treatment** — Targets uneven skin tone and texture, smoothing out imperfections for a more youthful appearance.

## How Skin Revitalization Works

Our laser technology delivers controlled light energy into the deeper layers of the skin, stimulating the body's natural collagen production without damaging the surface. This "inside-out" approach means your skin heals and improves from within, resulting in progressive improvement over the course of your treatment series. Each session builds upon the last, delivering cumulative benefits that continue to improve for weeks after treatment.`,
		parent: 'laser-services',
		enabled: true,
		whyChooseTitle: 'Expert Skin Revitalization in Knoxville & Farragut',
		whyChoose:
			'Sarah Hitchcox Aesthetics offers advanced laser skin revitalization in Knoxville and Farragut, TN. Our non-ablative laser treatments improve fine lines, texture, and tone with minimal downtime.',
		shortDescription:
			'Advanced laser treatments to smooth fine lines and improve skin tone and texture.',
		ctaText: 'Book Skin Revitalization',
		sections: [
			{
				type: 'features-grid',
				title: 'Key Benefits of Skin Revitalization',
				items: [
					{
						title: 'Boost Collagen',
						description: 'Stimulate natural collagen production.',
						icon: 'arrow-up',
					},
					{
						title: 'Smooth Texture',
						description: 'Reduce fine lines and uneven texture.',
						icon: 'droplet',
					},
					{
						title: 'No Downtime',
						description: 'Return to your day immediately.',
						icon: 'calendar',
					},
				],
			},
			{
				type: 'faq-accordion',
				title: 'Skin Revitalization FAQs',
				items: [
					{
						question: 'Is there any downtime?',
						answer:
							'There is minimal to no downtime. You may experience slight redness immediately after, which typically subsides quickly.',
					},
					{
						question: 'How many treatments are needed?',
						answer:
							'For best results, we typically recommend a series of 4-6 treatments spaced about 4 weeks apart.',
					},
					{
						question: 'When will I see results?',
						answer:
							'You may notice an immediate glow, with more significant improvements in texture and tone appearing over the course of your treatment series.',
					},
				],
			},
		],
	},

	'pigmented-lesion-reduction': {
		path: 'pigmented-lesion-reduction',
		name: 'Pigmented Lesion Reduction',
		tagline: 'for sun spots and age spots',
		title: 'Pigmented Lesion Reduction | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Laser pigmented lesion reduction for sun spots, age spots, and freckles on face, arms, legs, chest, and back in Knoxville and Farragut, TN.',
		content: `Our pigmented lesion reduction service effectively targets and reduces the appearance of sun spots, age spots, and freckles. We deliver precise laser energy to the pigmented areas, breaking down the pigment without damaging the surrounding skin. Treatment sessions are quick, often completed within 20-30 minutes. Most clients see significant improvement after 3-5 sessions, spaced 4 weeks apart. Suitable for all skin types, this service helps achieve a more even skin tone and rejuvenated appearance, restoring your skin's natural radiance with minimal downtime.

## Areas We Treat

- **Face** — Target and treat pigmented lesions on the face for a more even skin tone.
- **Arms** — Effective treatment for sun spots and age spots on the arms.
- **Legs** — Smooth out pigmentation on the legs for an even appearance.
- **Chest** — Treat hyperpigmentation on the chest for clearer skin.
- **Back** — Reduce pigmentation on the back for a more uniform skin tone.

## What Causes Pigmented Lesions?

Sun exposure, aging, and genetics all contribute to the formation of pigmented lesions. Years of UV exposure cause melanin to accumulate in certain areas, creating dark spots that become more prominent over time. Our laser treatment breaks down this excess pigment, allowing your body to naturally clear it away and reveal clearer, more even-toned skin beneath.`,
		parent: 'laser-services',
		enabled: true,
		whyChooseTitle: 'Expert Pigmented Lesion Treatment in Knoxville & Farragut',
		whyChoose:
			'Sarah Hitchcox Aesthetics provides advanced laser treatment for sun spots, age spots, and freckles in Knoxville and Farragut, TN. Our precise laser technology breaks down pigment for clearer, more even-toned skin.',
		shortDescription:
			'Laser treatment to reduce sun spots, age spots, and freckles for even-toned skin.',
		ctaText: 'Book Pigmented Lesion Treatment',
		sections: [
			{
				type: 'features-grid',
				title: 'Key Benefits of Pigmented Lesion Reduction',
				items: [
					{
						title: 'Targeted Action',
						description: 'Precisely targets dark spots without harming skin.',
						icon: 'target',
					},
					{
						title: 'Even Tone',
						description: 'Restore a uniform, radiant complexion.',
						icon: 'sun',
					},
					{
						title: 'Quick Results',
						description: 'See improvement in just a few sessions.',
						icon: 'zap',
					},
				],
			},
			{
				type: 'faq-accordion',
				title: 'Pigment Reduction FAQs',
				items: [
					{
						question: 'What types of spots can be treated?',
						answer:
							'We effectively treat sun spots, age spots, freckles, and other benign pigmented lesions on the face and body.',
					},
					{
						question: 'How many sessions are required?',
						answer:
							'Most clients see significant reduction after 3-5 sessions, spaced approximately 4 weeks apart.',
					},
					{
						question: 'Is the treatment safe?',
						answer:
							'Yes, our laser technology is FDA-cleared and safe for reducing pigmentation on various skin types.',
					},
				],
			},
		],
	},

	'vascular-lesion-reduction': {
		path: 'vascular-lesion-reduction',
		name: 'Vascular Lesion Reduction',
		tagline: 'for spider veins and redness',
		title: 'Vascular Lesion Reduction | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Laser vascular lesion treatment for spider veins, rosacea, and facial redness in Knoxville and Farragut, TN at Sarah Hitchcox Aesthetics.',
		content: `Our vascular lesion treatment effectively targets conditions such as spider veins, rosacea, and other vascular issues, improving the overall appearance of your skin. The laser delivers targeted energy that is absorbed by the hemoglobin in visible blood vessels, causing them to collapse and be naturally reabsorbed by the body over time.

## Treatments Available

- **Facial Vascular** — Treats facial vascular lesions like spider veins and rosacea, promoting clearer skin.
- **Superficial Veins** — Effectively reduces the appearance of superficial veins, restoring smooth skin.
- **Redness Reduction** — Targets and reduces redness caused by vascular conditions for a more even complexion.

## What to Expect

Vascular lesion treatment sessions are quick and well-tolerated, typically taking 15-30 minutes depending on the area being treated. Most patients notice significant improvement after 2-4 sessions. The treatment works by selectively targeting the blood vessels responsible for visible redness and veins, leaving the surrounding tissue unaffected. Mild redness may occur immediately after treatment but usually resolves within a few hours to a day.`,
		parent: 'laser-services',
		enabled: true,
		whyChooseTitle: 'Expert Vascular Lesion Treatment in Knoxville & Farragut',
		whyChoose:
			'Sarah Hitchcox Aesthetics offers advanced laser treatment for spider veins, rosacea, and facial redness in Knoxville and Farragut, TN. Our targeted laser technology eliminates visible vessels for clearer, calmer skin.',
		shortDescription:
			'Laser treatment for spider veins, rosacea, and persistent facial redness.',
		ctaText: 'Book Vascular Lesion Treatment',
		sections: [
			{
				type: 'features-grid',
				title: 'Key Benefits of Vascular Lesion Reduction',
				items: [
					{
						title: 'Reduce Redness',
						description: 'Calm rosacea and facial redness.',
						icon: 'minus-circle',
					},
					{
						title: 'Clear Veins',
						description: 'Eliminate visible spider veins.',
						icon: 'x-circle',
					},
					{
						title: 'Even Complexion',
						description: 'Achieve a clearer, more balanced skin tone.',
						icon: 'check',
					},
				],
			},
			{
				type: 'faq-accordion',
				title: 'Vascular FAQs',
				items: [
					{
						question: 'What conditions can be treated?',
						answer:
							'We treat spider veins, rosacea, broken capillaries, and general facial redness.',
					},
					{
						question: 'Does it hurt?',
						answer:
							'Most patients experience only mild discomfort, often described as a rubber band snap. The treatment is generally well-tolerated.',
					},
					{
						question: 'How long do results last?',
						answer:
							'Treated vessels are naturally absorbed by the body. However, new veins can form over time, so maintenance may be required.',
					},
				],
			},
		],
	},

	// ═══════════════════════════════════════════════
	// MICRONEEDLING – SUB-SERVICE PAGES
	// ═══════════════════════════════════════════════

	'microneedling/face': {
		path: 'microneedling/face',
		name: 'Face Microneedling',
		tagline: 'for scars, lines, and texture',
		title: 'Face Microneedling | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Face microneedling for acne scars, fine lines, wrinkles, and enlarged pores in Knoxville and Farragut, TN. Stimulate collagen at Sarah Hitchcox Aesthetics.',
		content: `After 25, your body's natural collagen production starts to decline, which is part of what causes visible signs of aging. Face microneedling helps stimulate the body's natural collagen production by creating thousands of tiny micro-channels in the skin that trigger a powerful healing response.

Collagen is a protein in your skin that gives it firmness and elasticity. By boosting collagen and elastin production, microneedling helps fight signs of aging like fine lines and wrinkles, and it can also help with acne scarring and enlarged pores — in general making your skin more youthful and smooth.

## The Treatment Process

The treatment takes about 20 minutes, and the provider will apply a topical numbing cream to make sure you are comfortable throughout the process. Sarah combines microneedling with targeted serums that penetrate deep into the micro-channels for enhanced results. These growth-factor serums amplify the collagen-boosting effects and provide immediate hydration and nourishment to the treated skin.

## Results and Frequency

While some improvement is visible shortly after treatment, optimal results emerge over several sessions as your body continues to produce new collagen. We typically recommend a series of 3-6 treatments spaced 4-6 weeks apart, depending on your specific skin concerns. Many patients see dramatic improvement in acne scarring, pore size, and overall skin texture after completing a full treatment series.`,
		parent: 'microneedling',
		enabled: true,
		shortDescription:
			'Stimulate collagen to improve acne scars, fine lines, and skin texture.',
		ctaText: 'Book Face Microneedling',
		sections: [
			{
				type: 'features-grid',
				title: 'Key Benefits of Face Microneedling',
				items: [
					{
						title: 'Acne Scars',
						description: 'Reduces the appearance of acne scarring.',
						icon: 'zap',
					},
					{
						title: 'Fine Lines',
						description: 'Smooths wrinkles for a youthful look.',
						icon: 'smile',
					},
					{
						title: 'Texture',
						description: 'Improves overall skin tone and texture.',
						icon: 'droplet',
					},
				],
			},
			{
				type: 'faq-accordion',
				title: 'Face Microneedling FAQs',
				items: [
					{
						question: 'What is microneedling?',
						answer:
							'Microneedling is a cosmetic procedure that involves pricking the skin with tiny, sterilized needles. The small wounds cause your body to make more collagen and elastin, which heal your skin and help to achieve a more youthful appearance.',
					},
					{
						question: 'Is microneedling painful?',
						answer:
							'Patients might experience mild discomfort during the procedure, but topical numbing cream is applied beforehand to minimize any pain.',
					},
					{
						question:
							'How long does it take to see results from microneedling?',
						answer:
							'While some effects can be seen immediately, optimal results typically emerge after several sessions and over a few months as collagen production increases.',
					},
					{
						question: 'What are the side effects of microneedling?',
						answer:
							'Common side effects include redness, swelling, and mild irritation, similar to a sunburn, which usually subside within a few days.',
					},
					{
						question: 'Can microneedling be done on all skin types?',
						answer: 'Yes, microneedling is safe for all skin types.',
					},
					{
						question: 'How often can I undergo microneedling?',
						answer:
							'It is generally recommended to wait 4-6 weeks between sessions to allow the skin to heal and regenerate.',
					},
				],
			},
		],
		faq: [
			{
				question: 'What is microneedling?',
				answer:
					'Microneedling is a cosmetic procedure that involves pricking the skin with tiny, sterilized needles. The small wounds cause your body to make more collagen and elastin, which heal your skin and help to achieve a more youthful appearance.',
			},
			{
				question: 'Is microneedling painful?',
				answer:
					'Patients might experience mild discomfort during the procedure, but topical numbing cream is applied beforehand to minimize any pain.',
			},
			{
				question: 'How long does it take to see results from microneedling?',
				answer:
					'While some effects can be seen immediately, optimal results typically emerge after several sessions and over a few months as collagen production increases.',
			},
			{
				question: 'What are the side effects of microneedling?',
				answer:
					'Common side effects include redness, swelling, and mild irritation, similar to a sunburn, which usually subside within a few days.',
			},
			{
				question: 'Can microneedling be done on all skin types?',
				answer: 'Yes, microneedling is safe for all skin types.',
			},
			{
				question: 'How often can I undergo microneedling?',
				answer:
					'It is generally recommended to wait 4-6 weeks between sessions to allow the skin to heal and regenerate.',
			},
		],
	},

	'microneedling/hair-loss': {
		path: 'microneedling/hair-loss',
		name: 'Hair Loss Microneedling',
		tagline: 'for hair regrowth and density',
		title: 'Hair Loss Microneedling | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Microneedling for hair loss prevention and regrowth in Knoxville and Farragut, TN. Stimulate hair follicles and enhance topical treatments. Sarah Hitchcox.',
		content: `Microneedling for hair loss is an innovative procedure designed to stimulate hair regrowth and improve hair density. This minimally invasive technique uses fine needles to create micro-injuries on the scalp, which promotes natural collagen production and enhances the delivery of growth factors. Ideal for addressing thinning hair and bald spots, microneedling offers a safe and effective solution for achieving a thicker, healthier head of hair.

## How It Works

The micro-channels created by the needles serve a dual purpose: they trigger the body's natural wound-healing response (which stimulates dormant hair follicles) and they dramatically improve the absorption of topical treatments like minoxidil and finasteride. When these treatments are applied directly after microneedling, they penetrate deeper and work more effectively than when applied to intact skin alone. Using a specialized serum after microneedling can also provide added hydration and soothe the scalp.

## Treatment Protocol

Most patients benefit from a series of treatments spaced 4-6 weeks apart. While some improvement may be noticed within a few weeks, optimal results typically emerge after several sessions over a few months as hair growth cycles progress. The treatment itself is well-tolerated — topical numbing cream is applied beforehand to minimize any discomfort. Common side effects include mild redness and irritation on the scalp, which usually subside within a few days.`,
		parent: 'microneedling',
		enabled: true,
		shortDescription:
			'Stimulate hair follicles and boost regrowth with scalp microneedling.',
		ctaText: 'Book Hair Loss Microneedling',
		sections: [
			{
				type: 'features-grid',
				title: 'Key Benefits of Hair Loss Microneedling',
				items: [
					{
						title: 'Regrowth',
						description: 'Stimulates dormant hair follicles.',
						icon: 'zap',
					},
					{
						title: 'Absorption',
						description: 'Enhances absorption of topical treatments.',
						icon: 'arrow-down',
					},
					{
						title: 'Density',
						description: 'Improves overall hair thickness and health.',
						icon: 'check',
					},
				],
			},
			{
				type: 'faq-accordion',
				title: 'Hair Loss FAQs',
				items: [
					{
						question: 'What is microneedling for hair loss?',
						answer:
							'Microneedling for hair loss is a cosmetic procedure that involves using tiny, sterilized needles to create micro-injuries on the scalp. These micro-injuries stimulate the production of collagen and growth factors, which can promote hair regrowth and improve hair density. Additionally, it enhances the absorption of topical treatments like minoxidil and finasteride, boosting their effectiveness.',
					},
					{
						question: 'Is microneedling painful?',
						answer:
							'Patients might experience mild discomfort during the procedure, but topical numbing cream is applied beforehand to minimize any pain.',
					},
					{
						question:
							'How long does it take to see results from microneedling for hair loss?',
						answer:
							'While some improvement may be noticed within a few weeks, optimal results typically emerge after several sessions over a few months as hair growth cycles progress.',
					},
					{
						question: 'What are the side effects of microneedling?',
						answer:
							'Common side effects include redness, swelling, and mild irritation on the scalp, which usually subside within a few days.',
					},
					{
						question: 'Can microneedling be done on all hair types?',
						answer: 'Yes, microneedling is safe for all hair types.',
					},
					{
						question: 'How often can I undergo microneedling for hair loss?',
						answer:
							'It is generally recommended to wait 4-6 weeks between sessions to allow the scalp to heal and regenerate.',
					},
					{
						question: 'Can I apply minoxidil after microneedling?',
						answer:
							'Yes, applying minoxidil directly after microneedling can enhance its absorption. Additionally, using a specialized serum can provide hydration and soothe the scalp.',
					},
				],
			},
		],
		faq: [
			{
				question: 'What is microneedling for hair loss?',
				answer:
					'Microneedling for hair loss is a cosmetic procedure that involves using tiny, sterilized needles to create micro-injuries on the scalp. These micro-injuries stimulate the production of collagen and growth factors, which can promote hair regrowth and improve hair density. Additionally, it enhances the absorption of topical treatments like minoxidil and finasteride, boosting their effectiveness.',
			},
			{
				question: 'Is microneedling painful?',
				answer:
					'Patients might experience mild discomfort during the procedure, but topical numbing cream is applied beforehand to minimize any pain.',
			},
			{
				question:
					'How long does it take to see results from microneedling for hair loss?',
				answer:
					'While some improvement may be noticed within a few weeks, optimal results typically emerge after several sessions over a few months as hair growth cycles progress.',
			},
			{
				question: 'What are the side effects of microneedling?',
				answer:
					'Common side effects include redness, swelling, and mild irritation on the scalp, which usually subside within a few days.',
			},
			{
				question: 'Can microneedling be done on all hair types?',
				answer: 'Yes, microneedling is safe for all hair types.',
			},
			{
				question: 'How often can I undergo microneedling for hair loss?',
				answer:
					'It is generally recommended to wait 4-6 weeks between sessions to allow the scalp to heal and regenerate.',
			},
			{
				question: 'Can I apply minoxidil after microneedling?',
				answer:
					'Yes, applying minoxidil directly after microneedling can enhance its absorption. Additionally, using a specialized serum can provide hydration and soothe the scalp.',
			},
		],
	},

	// ═══════════════════════════════════════════════
	// WEIGHT LOSS – SERVICE PAGES
	// ═══════════════════════════════════════════════

	semaglutide: {
		path: 'semaglutide',
		name: 'Semaglutide',
		tagline: 'for sustainable weight loss',
		title: 'Semaglutide Weight Loss Injections | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Medical weight loss with semaglutide (Ozempic/Wegovy) injections in Knoxville and Farragut, TN. GLP-1 therapy at about half the price. Free consultations at Sarah Hitchcox Aesthetics.',
		content: `Semaglutide is the active ingredient in Ozempic and Wegovy — and we offer it as a generic medication at about half the brand-name price. As a GLP-1 receptor agonist, semaglutide mimics natural hormones in your body that promote feelings of fullness and reduce cravings, making it one of the most effective medical weight loss treatments available.

## How Semaglutide Works

Semaglutide targets GLP-1 receptors in the brain that regulate appetite and satiety. It helps you feel fuller faster, stay satisfied longer, and naturally reduce calorie intake — without the feeling of deprivation. It also supports blood sugar regulation, which can be beneficial for patients with insulin resistance or prediabetes.

## What to Expect

Semaglutide is administered as a simple once-weekly subcutaneous injection. Dosing starts low and gradually increases to minimize side effects. Most patients notice reduced appetite and cravings within the first few weeks, with steady weight loss continuing over months of treatment.

## Free Weight Loss Consultations

Not sure if semaglutide is right for you? Schedule a complimentary consultation to discuss your health and weight loss goals. Our medically supervised program includes regular check-ins, dosage adjustments, and lifestyle guidance to ensure safe, effective progress.`,
		parent: 'weight-loss',
		enabled: true,
		whyChooseTitle: 'Expert Semaglutide Weight Loss in Knoxville & Farragut',
		whyChoose:
			'Sarah Hitchcox Aesthetics offers affordable semaglutide weight loss injections in Knoxville and Farragut, TN with full medical supervision, personalized dosing, and lifestyle guidance for sustainable results.',
		shortDescription:
			'GLP-1 injections for safe, medically supervised weight loss at half the brand-name price.',
		ctaText: 'Book Semaglutide Consultation',
		sections: [
			{
				type: 'features-grid',
				title: 'Key Benefits of Semaglutide Weight Loss',
				items: [
					{
						title: 'Appetite Control',
						description: 'Reduces cravings and promotes fullness.',
						icon: 'check-circle',
					},
					{
						title: 'Weekly Dosing',
						description: 'Convenient once-weekly injection.',
						icon: 'calendar',
					},
					{
						title: 'Proven Results',
						description: 'Effective for significant weight loss.',
						icon: 'trending-down',
					},
				],
			},
			{
				type: 'faq-accordion',
				title: 'Semaglutide Weight Loss FAQs',
				items: [
					{
						question: 'How does semaglutide work?',
						answer:
							"Semaglutide mimics a natural hormone (GLP-1) that targets the brain's appetite regulation centers. It helps you feel fuller faster and stay full longer, reducing overall calorie intake without the feeling of deprivation.",
					},
					{
						question: 'How much weight can I expect to lose?',
						answer:
							'While individual results vary, clinical trials show that many patients lose an average of 15% of their body weight when combined with diet and exercise.',
					},
					{
						question:
							"What's the difference between semaglutide and tirzepatide?",
						answer:
							'Tirzepatide acts on two hormone receptors (GLP-1 and GIP) while semaglutide acts on one. This dual action can potentially lead to greater weight loss for some patients. We will help determine which is right for you.',
					},
					{
						question: 'Is the program medically supervised?',
						answer:
							'Yes. Your health is our priority. We monitor your progress, manage side effects, and adjust dosages to ensure you are losing weight safely and effectively.',
					},
					{
						question: 'How do I get started?',
						answer:
							'Schedule a free consultation. We will review your medical history, discuss your goals, and if you are a candidate, start you on a personalized path to weight loss.',
					},
				],
			},
		],
		faq: [
			{
				question: 'How does semaglutide work?',
				answer:
					"Semaglutide mimics a natural hormone (GLP-1) that targets the brain's appetite regulation centers. It helps you feel fuller faster and stay full longer, reducing overall calorie intake without the feeling of deprivation.",
			},
			{
				question: 'How much weight can I expect to lose?',
				answer:
					'While individual results vary, clinical trials show that many patients lose an average of 15% of their body weight when combined with diet and exercise.',
			},
			{
				question: "What's the difference between semaglutide and tirzepatide?",
				answer:
					'Tirzepatide acts on two hormone receptors (GLP-1 and GIP) while semaglutide acts on one. This dual action can potentially lead to greater weight loss for some patients. We will help determine which is right for you.',
			},
			{
				question: 'Is the program medically supervised?',
				answer:
					'Yes. Your health is our priority. We monitor your progress, manage side effects, and adjust dosages to ensure you are losing weight safely and effectively.',
			},
			{
				question: 'How do I get started?',
				answer:
					'Schedule a free consultation. We will review your medical history, discuss your goals, and if you are a candidate, start you on a personalized path to weight loss.',
			},
		],
	},

	tirzepatide: {
		path: 'tirzepatide',
		name: 'Tirzepatide',
		tagline: 'for medical weight loss',
		title: 'Tirzepatide (Zepbound) | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Tirzepatide (Zepbound/Mounjaro) weight loss injections in Knoxville and Farragut, TN. Dual-action GIP/GLP-1 medication for significant, sustainable weight loss.',
		content: `Tirzepatide is a groundbreaking dual-action weight loss medication that targets both GIP and GLP-1 receptors — making it one of the most effective medical weight loss treatments available today. Marketed as Zepbound for weight management and Mounjaro for diabetes, tirzepatide has shown remarkable results in clinical trials, with patients losing significantly more weight compared to semaglutide alone.

## How Tirzepatide Works

Unlike semaglutide, which targets only GLP-1 receptors, tirzepatide activates both GIP and GLP-1 pathways. This dual mechanism reduces appetite, slows gastric emptying, and improves how your body processes insulin and sugar. The result is more effective weight loss with potentially fewer side effects for many patients.

## Tirzepatide vs Semaglutide

Both are excellent options, and Sarah will help determine which is right for you. In head-to-head studies, tirzepatide has shown greater average weight loss. However, individual responses vary, and some patients respond better to one medication over the other. We offer both so you can find the best fit for your body and goals.

## What to Expect

Tirzepatide is administered as a once-weekly subcutaneous injection. Dosing starts low and gradually increases to minimize side effects. Most patients begin to notice reduced appetite and weight loss within the first few weeks. We monitor your progress closely and adjust your treatment plan as needed.`,
		parent: 'weight-loss',
		enabled: true,
		shortDescription:
			'Dual-action GIP/GLP-1 injections for significant, sustainable weight loss results.',
		ctaText: 'Book Tirzepatide Consultation',
		sections: [
			{
				type: 'features-grid',
				title: 'Key Benefits of Tirzepatide Weight Loss',
				items: [
					{
						title: 'Dual Action',
						description:
							'Targets both GIP and GLP-1 receptors for enhanced weight loss results.',
					},
					{
						title: 'Proven Results',
						description:
							'Clinical trials showed up to 22% body weight reduction in some patients.',
					},
					{
						title: 'Weekly Injection',
						description:
							'Simple once-weekly injection that fits easily into your routine.',
					},
				],
			},
			{
				type: 'faq-accordion',
				title: 'Tirzepatide Weight Loss FAQs',
				items: [
					{
						question:
							'What is the difference between tirzepatide and semaglutide?',
						answer:
							'Tirzepatide targets both GIP and GLP-1 receptors, while semaglutide targets only GLP-1. This dual action may lead to greater weight loss for some patients. Both are administered as weekly injections.',
					},
					{
						question: 'How much weight can I expect to lose with tirzepatide?',
						answer:
							'Results vary by individual, but clinical trials showed average weight loss of 15-22% of body weight over 72 weeks at the highest doses.',
					},
					{
						question: 'What are the side effects of tirzepatide?',
						answer:
							'The most common side effects are nausea, diarrhea, and decreased appetite, which typically improve as your body adjusts. Starting at a low dose and gradually increasing helps minimize these effects.',
					},
					{
						question: 'Is tirzepatide the same as Mounjaro or Zepbound?',
						answer:
							'Yes. Mounjaro is the brand name for tirzepatide when prescribed for diabetes, and Zepbound is the brand name when prescribed specifically for weight management. The active ingredient is the same.',
					},
				],
			},
		],
	},

	everesse: {
		path: 'everesse',
		name: 'Everesse',
		tagline: 'for skin tightening and lifting',
		title: 'Everesse Skin Tightening | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Everesse non-surgical skin tightening for jawline, cheeks, and neck. Radiofrequency treatment with no downtime in Knoxville and Farragut, TN.',
		content: `Everesse tightens and lifts where laxity shows first. Using comfort-first cooling with targeted radiofrequency, it warms deeper tissues to trigger remodeling while keeping the surface skin comfortable. Appointments are quick, results build over weeks, and the outcome is a firmer, more contoured look without surgery.

## Benefits

- **Non-surgical** — No incisions, no anesthesia, and minimal downtime so you can get back to life fast.
- **Comfort-first cooling** — Continuous water-cooling helps protect the skin surface while delivering therapeutic heat where it matters.
- **Visible lift** — Targets cheek, jawline, and lower face laxity to create a firmer, more contoured appearance.
- **Quick appointments** — Most treatments take 30-60 minutes depending on areas treated.
- **Builds over weeks** — Results improve as your skin remodels, with best outcomes typically at 12 weeks.

## Popular Treatment Areas

- **Jawline + Jowls** — Define and lift the jawline while softening jowls for a sharper profile.
- **Cheeks** — Restore mid-face volume appearance and a subtle lift for a refreshed look.
- **Neck** — Tighten laxity and improve skin texture across the front and sides of the neck.
- **Nasolabial + Marionette** — Support adjacent tissue to reduce the look of folds and lines around the mouth.
- **Lower Face** — Comprehensive contouring focus for the perioral area, chin, and jawline.

## What to Expect

We start with photos and a focused consultation to map your goals. The handpiece glides with a cooling gel as we deliver controlled heat in passes. Most visits wrap in 30-60 minutes. Expect a healthy glow the same day, with firmer contours emerging over the next 4-12 weeks.`,
		parent: 'laser-services',
		enabled: true,
		whyChooseTitle: 'Expert Everesse Skin Tightening in Knoxville & Farragut',
		whyChoose:
			'Sarah Hitchcox Aesthetics offers Everesse skin tightening in Knoxville and Farragut, TN. Our advanced radiofrequency treatment firms and lifts sagging skin without surgery for visible jawline tightening and facial rejuvenation.',
		shortDescription:
			'Non-surgical radiofrequency skin tightening for jawline, cheeks, and neck.',
		ctaText: 'Book Everesse',
		children: ['everesse/face', 'everesse/neck', 'everesse/jawline'],
		sections: [
			{
				type: 'features-grid',
				title: 'Benefits of Everesse Skin Tightening',
				items: [
					{
						title: 'Non-Surgical Lift',
						description: 'Tightens skin without incisions.',
						icon: 'shield',
					},
					{
						title: 'Smart Cooling',
						description: 'Keeps surface skin comfortable.',
						icon: 'thermometer',
					},
					{
						title: 'Natural Results',
						description: 'Stimulates your own collagen.',
						icon: 'star',
					},
				],
			},
			{
				type: 'faq-accordion',
				title: 'Everesse FAQs',
				items: [
					{
						question: 'What is Everesse?',
						answer:
							'Everesse is a non-invasive skin tightening treatment that delivers focused radiofrequency energy below the skin surface while actively cooling the epidermis. The heat stimulates remodeling for a firmer, lifted look over time.',
					},
					{
						question: 'What does it feel like?',
						answer:
							'Most clients describe a warm sensation with brief heat pulses. Thanks to active cooling, comfort is high and anesthetic is usually unnecessary.',
					},
					{
						question: 'How many sessions will I need?',
						answer:
							'Many see improvement after a single session, with optimal plans ranging from 1-3 sessions spaced 4-6 weeks apart depending on goals and skin baseline.',
					},
					{
						question: 'Is there downtime?',
						answer:
							'Downtime is minimal. Mild redness or puffiness may occur and typically resolves within hours. Makeup is usually fine the next day.',
					},
					{
						question: 'Who is a good candidate?',
						answer:
							'Adults with mild to moderate laxity of the cheeks, jawline, or neck who want firmer contours without surgery. If you are pregnant, have active infections, implanted electronic devices, or recent fillers in the target area, we will customize timing or advise alternatives.',
					},
					{
						question: 'When will I see results and how long do they last?',
						answer:
							'You may notice early tightening in 2-4 weeks, with peak improvements around 12 weeks as new collagen matures. Results vary by age and lifestyle; maintenance sessions can help sustain outcomes.',
					},
				],
			},
		],
		faq: [
			{
				question: 'What is Everesse?',
				answer:
					'Everesse is a non-invasive skin tightening treatment that delivers focused radiofrequency energy below the skin surface while actively cooling the epidermis. The heat stimulates remodeling for a firmer, lifted look over time.',
			},
			{
				question: 'What does it feel like?',
				answer:
					'Most clients describe a warm sensation with brief heat pulses. Thanks to active cooling, comfort is high and anesthetic is usually unnecessary.',
			},
			{
				question: 'How many sessions will I need?',
				answer:
					'Many see improvement after a single session, with optimal plans ranging from 1-3 sessions spaced 4-6 weeks apart depending on goals and skin baseline.',
			},
			{
				question: 'Is there downtime?',
				answer:
					'Downtime is minimal. Mild redness or puffiness may occur and typically resolves within hours. Makeup is usually fine the next day.',
			},
			{
				question: 'Who is a good candidate?',
				answer:
					'Adults with mild to moderate laxity of the cheeks, jawline, or neck who want firmer contours without surgery. If you are pregnant, have active infections, implanted electronic devices, or recent fillers in the target area, we will customize timing or advise alternatives.',
			},
			{
				question: 'When will I see results and how long do they last?',
				answer:
					'You may notice early tightening in 2-4 weeks, with peak improvements around 12 weeks as new collagen matures. Results vary by age and lifestyle; maintenance sessions can help sustain outcomes.',
			},
		],
	},

	// ═══════════════════════════════════════════════
	// EVERESSE SUB-SERVICES
	// ═══════════════════════════════════════════════

	'everesse/face': {
		path: 'everesse/face',
		name: 'Everesse Face',
		tagline: 'for lifted cheeks and smoother skin',
		title: 'Everesse Face Tightening | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Non-surgical face lifting with Everesse in Knoxville. Tighten cheeks, soften nasolabial folds, and improve skin texture with radiofrequency.',
		content: `Restore a youthful lift to your mid-face and smooth nasolabial folds with Everesse. This targeted radiofrequency treatment stimulates collagen deep within the dermis to tighten lax skin on the cheeks and lower face. The result is a subtle, natural-looking lift that refreshes your appearance without the need for surgery or fillers.

## Benefits for the Face

- **Cheek Lift** — Restores the appearance of volume and lift to the mid-face.
- **Smoother Folds** — Softens the look of nasolabial folds and marionette lines by tightening adjacent skin.
- **Improved Texture** — Enhances overall skin quality and firmness.
- **Comfortable Treatment** — Advanced cooling technology ensures a comfortable experience with no downtime.`,
		parent: 'everesse',
		enabled: true,
		whyChooseTitle: 'Why Choose Everesse Face Tightening?',
		whyChoose:
			'Address facial laxity at its source. Everesse stimulates your body’s natural collagen production for long-lasting, natural-looking firmness.',
		shortDescription:
			'Lift cheeks and smooth nasolabial folds with non-surgical radiofrequency.',
		ctaText: 'Book Face Treatment',
	},

	'everesse/jawline': {
		path: 'everesse/jawline',
		name: 'Everesse Jawline',
		tagline: 'for a defined, contoured profile',
		title: 'Everesse Jawline Tightening | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Sharpen your jawline and reduce jowls with Everesse skin tightening in Knoxville. Non-invasive contouring for a more defined profile.',
		content: `Redefine your jawline and reduce the appearance of early jowls with Everesse. By delivering precise heat energy to the lower face, Everesse tightens the skin along the jaw, creating a sharper, more sculpted profile. It's an ideal non-surgical solution for those noticing mild to moderate laxity who want to maintain a crisp jawline.

## Benefits for the Jawline

- **Sharper Definition** — Tightens skin along the mandible for a more distinct jawline.
- **Jowl Reduction** — Lifts sagging tissue to soften the appearance of jowls.
- **Chin Contouring** — Improves firmness under the chin for a cohesive look.
- **No downtime** — Return to your daily routine immediately after treatment.`,
		parent: 'everesse',
		enabled: true,
		whyChooseTitle: 'Why Choose Everesse for Jawline Contouring?',
		whyChoose:
			'Achieve a sculpted jawline without needles or surgery. Everesse offers a precise, comfortable way to tighten and define the lower face.',
		shortDescription:
			'Sharpen your jawline and reduce jowls for a more defined profile.',
		ctaText: 'Book Jawline Treatment',
	},

	'everesse/neck': {
		path: 'everesse/neck',
		name: 'Everesse Neck',
		tagline: 'for tighter, smoother neck skin',
		title: 'Everesse Neck Tightening | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Tighten loose neck skin and improve texture with Everesse in Knoxville. Non-surgical neck lift using advanced radiofrequency technology.',
		content: `Treat neck laxity and "crepey" skin texture with Everesse. The neck is often one of the first areas to show signs of aging, but surgical options can be invasive. Everesse offers a powerful non-surgical alternative, using radiofrequency to tighten skin and stimulate collagen production across the neck for a smoother, firmer appearance.

## Benefits for the Neck

- **Skin Tightening** — Firms loose skin on the front and sides of the neck.
- **Texture Improvement** — Smooths fine lines and improves "crepey" skin texture.
- **Non-Invasive** — A safe and effective alternative to surgical neck lifts.
- **Gradual Results** — Improvements build over time for a natural transformation.`,
		parent: 'everesse',
		enabled: true,
		whyChooseTitle: 'Why Choose Everesse Neck Tightening?',
		whyChoose:
			'Rejuvenate your neck with confidence. Everesse targets delicate neck skin safely and effectively to restore firmness and texture.',
		shortDescription:
			'Tighten laxity and improve texture on the neck without surgery.',
		ctaText: 'Book Neck Treatment',
	},
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

export function getPage(path: string): SitePage | undefined {
	return sitePages[path]
}

export function getChildren(path: string): SitePage[] {
	const page = sitePages[path]
	if (!page?.children) return []
	return page.children
		.map(childPath => sitePages[childPath])
		.filter((child): child is SitePage => child !== undefined)
}

export function getParent(path: string): SitePage | undefined {
	const page = sitePages[path]
	if (!page?.parent) return undefined
	return sitePages[page.parent]
}

export function getAllEnabledPages(): SitePage[] {
	return Object.values(sitePages).filter(page => page.enabled)
}

export function getCategoryPages(): SitePage[] {
	return Object.values(sitePages).filter(
		page => page.enabled && !page.parent && page.children !== undefined,
	)
}

export function isServicePage(path: string): boolean {
	return path in sitePages
}

/** Returns ancestors from immediate parent up to root, in order [parent, grandparent, ...] */
export function getAncestors(path: string): SitePage[] {
	const ancestors: SitePage[] = []
	let current = sitePages[path]
	while (current?.parent) {
		const parentPage = sitePages[current.parent]
		if (!parentPage) break
		ancestors.push(parentPage)
		current = parentPage
	}
	return ancestors
}

/** Returns sibling pages (same parent, excluding self) */
export function getSiblings(path: string): SitePage[] {
	const page = sitePages[path]
	if (!page?.parent) return []
	const parent = sitePages[page.parent]
	if (!parent?.children) return []
	return parent.children
		.filter(childPath => childPath !== path)
		.map(childPath => sitePages[childPath])
		.filter(
			(sibling): sibling is SitePage =>
				sibling !== undefined && sibling.enabled,
		)
}
