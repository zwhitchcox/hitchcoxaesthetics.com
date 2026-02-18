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
	sections?: ServicePageSection[]
}

export const locationServices: Record<string, LocationServiceData> = {
	// ──────────────────────────────────────────────
	// BOTOX
	// ──────────────────────────────────────────────
	'knoxville-botox': {
		slug: 'knoxville-botox',
		locationName: 'Knoxville',
		locationId: 'knoxville',
		serviceName: 'Botox',
		serviceSlug: 'botox',
		title: 'Botox in Knoxville, TN | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Get expert Botox injections at our Knoxville med spa on Kingston Pike in the Bearden area. Natural-looking results from an experienced injector. Book today.',
		h1: 'Botox in Knoxville',
		h2: 'Expert Botox Injections at Our Knoxville Med Spa',
		introParagraph:
			'Our Knoxville office on Kingston Pike in the heart of the Bearden area makes it easy to fit Botox into your busy schedule. Located just minutes from downtown Knoxville, we offer a welcoming environment where you can relax and receive treatment during a lunch break or after work. Sarah Hitchcox brings years of injection expertise to every appointment, ensuring natural-looking results that smooth fine lines without sacrificing expression.',
		bodyParagraph:
			'West Knoxville residents love the convenience of a trusted med spa right in their neighborhood. Our Kingston Pike location provides private treatment rooms and a calm atmosphere, so you can feel completely at ease throughout your Botox session. Whether you are maintaining your current routine or exploring Botox for the first time, our Knoxville team is here to guide you with personalized treatment plans.',
		shortDescription:
			'Smooth fine lines and wrinkles at our Bearden office in Knoxville. Natural-looking results tailored to you.',
		tagline: 'for fine lines and wrinkles',
		whyChooseTitle: 'Best Botox Injector in Knoxville, TN',
		whyChoose:
			"If you are searching for Botox in Knoxville or Botox injections in Knoxville, TN, Sarah Hitchcox Aesthetics is the premier choice. As one of the most trusted Botox providers near Knoxville, we specialize in preventative Botox, Botox for forehead lines, and crow's feet treatment that delivers natural, refreshed results. Whether you need a skilled Botox injector in Knoxville or want to explore Botox near me in the Bearden and West Knoxville area, our experienced team is here to help you look and feel your best.",
		ctaText: 'Book Botox in Knoxville',
		sections: [
			{
				type: 'features-grid',
				title: 'Why Choose Botox in Knoxville?',
				items: [
					{
						title: 'Natural Results',
						description:
							'Our signature technique ensures you look refreshed and rested, never frozen or overdone.',
					},
					{
						title: 'Bearden Convenience',
						description:
							'Located centrally on Kingston Pike, we are easily accessible from Downtown, Sequoyah Hills, and West Knoxville.',
					},
					{
						title: 'Quick Treatment',
						description:
							'Most sessions take just 15-30 minutes, making it the perfect lunch-break refresh.',
					},
				],
			},
			{
				type: 'text-block',
				title: 'What to Expect',
				content:
					'Botox works by temporarily relaxing the facial muscles that cause wrinkles, resulting in smoother skin overlying the treated area. Results typically begin to appear within 3-7 days, with full effect at 14 days. Our Knoxville clients love the boost of confidence that comes with a brighter, more youthful appearance.',
			},
		],
	},
	'farragut-botox': {
		slug: 'farragut-botox',
		locationName: 'Farragut',
		locationId: 'farragut',
		serviceName: 'Botox',
		serviceSlug: 'botox',
		title: 'Botox in Farragut, TN | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Farragut Botox treatments near Campbell Station Road. Enjoy natural, refreshed results at our Farragut med spa. Schedule your consultation today.',
		h1: 'Botox in Farragut',
		h2: 'Expert Botox Injections at Our Farragut Med Spa',
		introParagraph:
			'Conveniently located near Campbell Station Road, our Farragut office brings premium Botox treatments to the heart of the Farragut community. If you live or work near Turkey Creek, you can pop in for a quick session and get back to your day in no time. We pride ourselves on creating a comfortable, boutique experience for every guest who walks through our doors.',
		bodyParagraph:
			'The Farragut community deserves access to top-tier aesthetic care without a long drive. Our location is ideal for West Knox families and professionals who want to look refreshed and confident. With a focus on precise, conservative injections, Sarah ensures your Botox results complement your natural features and keep you looking like yourself, only more rested.',
		shortDescription:
			'Refresh your look with expert Botox treatments at our Campbell Station location in Farragut. Quick and convenient.',
		tagline: 'for fine lines and wrinkles',
		whyChooseTitle: 'Top-Rated Botox Provider in Farragut, TN',
		whyChoose:
			'Looking for Botox in Farragut or expert Botox injections in Farragut, TN? Our Campbell Station location makes it easy to get premium wrinkle treatment in Farragut without a long drive. We are known as one of the best Botox providers in Farragut, TN, offering preventative Botox for younger patients and targeted treatments for established lines. Residents searching for Botox near me in Farragut trust us for natural, conservative results that keep you looking like yourself.',
		ctaText: 'Book Botox in Farragut',
		sections: [
			{
				type: 'features-grid',
				title: 'Farragut’s Premier Botox Experience',
				items: [
					{
						title: 'Turkey Creek Access',
						description:
							'We are just moments away from the Turkey Creek shopping district, perfect for a post-shopping refresh.',
					},
					{
						title: 'Preventative Care',
						description:
							'Start your anti-aging journey early to prevent deep static lines from forming.',
					},
					{
						title: 'Tailored Dosing',
						description:
							'We customize every unit to your unique muscle strength and aesthetic goals.',
					},
				],
			},
			{
				type: 'text-block',
				title: 'Look Like You, Only Better',
				content:
					'Our Farragut clients appreciate our conservative approach. We believe the best injectable work goes unnoticed—friends will simply tell you that you look great. Whether smoothing forehead lines, crow’s feet, or frown lines, we enhance your natural beauty with precision.',
			},
		],
	},

	// ──────────────────────────────────────────────
	// FILLER
	// ──────────────────────────────────────────────
	'knoxville-filler': {
		slug: 'knoxville-filler',
		locationName: 'Knoxville',
		locationId: 'knoxville',
		serviceName: 'Filler',
		serviceSlug: 'filler',
		title: 'Filler in Knoxville, TN | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Restore volume and enhance your features with dermal fillers at our Knoxville med spa on Kingston Pike. Expert injections for lips, cheeks, and more.',
		h1: 'Filler in Knoxville',
		h2: 'Professional Filler Treatments in Knoxville',
		introParagraph:
			'At our Kingston Pike office in the Bearden area, we offer a full range of dermal filler treatments designed to restore youthful volume and enhance your natural contours. Whether you are looking to add definition to your lips, lift your cheeks, or soften nasolabial folds, our Knoxville location makes it simple to access expert care. Each treatment begins with a thorough consultation so we can understand your goals and craft a customized plan.',
		bodyParagraph:
			'Being situated in West Knoxville means our clients can enjoy quick appointments that fit seamlessly into their routines. Our Knoxville office is equipped with the latest filler products from trusted brands, and Sarah takes a layered, artistic approach to ensure balanced, harmonious results. Convenient to downtown and the surrounding neighborhoods, this is the go-to spot for Knoxville residents seeking subtle, beautiful enhancements.',
		shortDescription:
			'Restore volume and contour your features at our Bearden office in Knoxville. Enhance lips, cheeks, and more.',
		tagline: 'for lips, cheeks, facial balancing',
		whyChooseTitle: 'Best Filler Injector in Knoxville, TN',
		whyChoose:
			'Sarah Hitchcox Aesthetics is the go-to destination for filler in Knoxville and dermal filler injections in Knoxville, TN. Whether you want lip filler, cheek filler, or jawline filler in Knoxville, our artistic approach ensures balanced, natural-looking results. As one of the best filler injectors in Knoxville, Sarah uses premium products and advanced techniques to deliver fillers that enhance your features without looking overdone. If you are searching for filler injections in Knoxville, schedule a consultation today.',
		ctaText: 'Book Fillers in Knoxville',
		sections: [
			{
				type: 'features-grid',
				title: 'Enhance Your Natural Beauty',
				items: [
					{
						title: 'Volume Restoration',
						description:
							'Replenish lost volume in cheeks and temples for a lifted, youthful look.',
					},
					{
						title: 'Lip Enhancement',
						description:
							'From subtle hydration to full plumping, we create the perfect pout for your face shape.',
					},
					{
						title: 'Chin & Jawline',
						description:
							'Define your profile and balance your features with structural filler placement.',
					},
				],
			},
			{
				type: 'text-block',
				title: 'The Liquid Facelift',
				content:
					'By strategically placing filler in multiple areas, we can achieve a "liquid facelift" effect that rejuvenates the entire face. This non-surgical approach is a favorite among our Knoxville clients who want significant results with minimal downtime compared to surgery.',
			},
		],
	},
	'farragut-filler': {
		slug: 'farragut-filler',
		locationName: 'Farragut',
		locationId: 'farragut',
		serviceName: 'Filler',
		serviceSlug: 'filler',
		title: 'Filler in Farragut, TN | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Get natural-looking dermal fillers near Campbell Station Road in Farragut. Lip, cheek, and jawline filler by an experienced injector. Book now.',
		h1: 'Filler in Farragut',
		h2: 'Professional Filler Treatments in Farragut',
		introParagraph:
			'Our Farragut office near Campbell Station Road is the perfect destination for anyone in the Farragut community seeking expert dermal filler treatments. From lip augmentation to cheek contouring, we tailor every session to your unique facial anatomy and aesthetic preferences. The relaxed setting of our Farragut location helps you feel at ease from the moment you arrive.',
		bodyParagraph:
			'Living near Turkey Creek and West Knox means you no longer need to travel far for high-quality filler injections. Our Farragut med spa provides a private, personalized experience where Sarah takes her time to sculpt natural-looking results. We use only premium hyaluronic acid fillers and advanced techniques, giving Farragut clients access to the same caliber of care found in major metropolitan areas.',
		shortDescription:
			'Achieve natural-looking volume and definition at our Campbell Station location in Farragut. Expert filler injections.',
		tagline: 'for lips, cheeks, facial balancing',
		whyChooseTitle: 'Top-Rated Filler Provider in Farragut, TN',
		whyChoose:
			'For filler in Farragut, including lip filler, cheek filler, and jawline filler, our Campbell Station office delivers expert results close to home. As a leading dermal filler provider in Farragut, TN, we take an artistic approach to facial balancing that enhances your natural beauty. Residents searching for filler near me in Farragut trust Sarah for precise, natural-looking injections that restore volume and define contours without looking overdone.',
		ctaText: 'Book Fillers in Farragut',
		sections: [
			{
				type: 'features-grid',
				title: 'Sculpt & Define',
				items: [
					{
						title: 'Facial Balancing',
						description:
							'We analyze your unique proportions to ensure filler enhances your overall harmony.',
					},
					{
						title: 'Smooth Deep Lines',
						description:
							'Soften nasolabial folds and marionette lines for a smoother, happier expression.',
					},
					{
						title: 'Immediate Results',
						description:
							'Walk out of our Farragut office looking instantly refreshed and rejuvenated.',
					},
				],
			},
			{
				type: 'text-block',
				title: 'Safe, Expert Care',
				content:
					'Safety is our top priority. Sarah uses advanced techniques, including micro-cannulas, to minimize bruising and maximize safety. Farragut residents trust us for results that look and feel natural, avoiding the "over-filled" look.',
			},
		],
	},

	// ──────────────────────────────────────────────
	// SKINVIVE
	// ──────────────────────────────────────────────
	'knoxville-skinvive': {
		slug: 'knoxville-skinvive',
		locationName: 'Knoxville',
		locationId: 'knoxville',
		serviceName: 'Juvederm SkinVive',
		serviceSlug: 'skinvive',
		title: 'SkinVive in Knoxville, TN | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Experience Juvederm SkinVive at our Knoxville med spa on Kingston Pike. Boost skin hydration and smoothness with this innovative injectable. Book today.',
		h1: 'Juvederm SkinVive in Knoxville',
		h2: 'Radiant, Hydrated Skin at Our Knoxville Location',
		introParagraph:
			'Juvederm SkinVive is a breakthrough injectable designed to improve skin smoothness and hydration from the inside out. At our Kingston Pike office in the Bearden area, Knoxville clients can experience this innovative treatment in a comfortable, modern setting. SkinVive works differently from traditional fillers, delivering micro-droplets of hyaluronic acid into the skin to create a lasting glow.',
		bodyParagraph:
			'Our West Knoxville location is convenient to downtown and the surrounding communities, making it easy to schedule a SkinVive session on your own terms. The treatment requires minimal downtime, so many of our Knoxville clients stop in during lunch and return to their day looking refreshed. Sarah will assess your skin quality and recommend the optimal number of sessions to achieve that dewy, healthy complexion you are after.',
		shortDescription:
			'Hydrate your skin from within at our Bearden office in Knoxville. Achieve a lasting, radiant glow with SkinVive.',
		tagline: 'for skin hydration and glow',
		whyChooseTitle: 'Premier SkinVive Provider in Knoxville, TN',
		whyChoose:
			'Experience SkinVive in Knoxville at Sarah Hitchcox Aesthetics, your trusted provider for Juvederm SkinVive in Knoxville. This innovative skin hydration treatment in Knoxville delivers a radiant, dewy glow that topical products simply cannot match. If you are looking for a skin glow treatment in Knoxville, TN that improves texture and luminosity from the inside out, SkinVive is the answer. Our Bearden office makes it easy to access this next-generation skin quality treatment.',
		ctaText: 'Book SkinVive in Knoxville',
		sections: [
			{
				type: 'features-grid',
				title: 'The SkinVive Glow',
				items: [
					{
						title: 'Internal Hydration',
						description:
							'Injects moisture directly into the dermis for lasting hydration that creams can’t match.',
					},
					{
						title: 'Cheek Smoothness',
						description:
							'Clinically proven to smooth cheek skin and improve texture for 6 months.',
					},
					{
						title: 'Radiant Finish',
						description:
							'Achieve a healthy, light-reflecting glow that looks great with or without makeup.',
					},
				],
			},
			{
				type: 'text-block',
				title: 'Who is it For?',
				content:
					'SkinVive is suitable for all skin tones and types. If you feel your skin looks dull, dehydrated, or lacks that "bounce," this treatment is the perfect solution. It pairs beautifully with other Knoxville treatments like Botox for a comprehensive refresh.',
			},
		],
	},
	'farragut-skinvive': {
		slug: 'farragut-skinvive',
		locationName: 'Farragut',
		locationId: 'farragut',
		serviceName: 'Juvederm SkinVive',
		serviceSlug: 'skinvive',
		title: 'SkinVive in Farragut, TN | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Discover Juvederm SkinVive near Campbell Station Road in Farragut. Enhance skin glow and texture with this next-gen injectable treatment.',
		h1: 'Juvederm SkinVive in Farragut',
		h2: 'Radiant, Hydrated Skin at Our Farragut Location',
		introParagraph:
			'The Farragut community now has convenient access to Juvederm SkinVive, the latest advancement in skin-quality injectables. Our office near Campbell Station Road provides a tranquil atmosphere where you can learn about and receive this cutting-edge hydration treatment. SkinVive deposits tiny amounts of hyaluronic acid beneath the skin surface, giving your complexion a natural luminosity that skincare alone cannot achieve.',
		bodyParagraph:
			'For residents near Turkey Creek and throughout West Knox, our Farragut office eliminates the need for a long commute to access premium aesthetic treatments. SkinVive is ideal for anyone who wants smoother, more hydrated skin without the volume changes associated with traditional fillers. Sarah will evaluate your skin and design a treatment protocol that delivers visible improvement in texture and radiance over the weeks following your visit.',
		shortDescription:
			'Boost skin hydration and smoothness at our Campbell Station location in Farragut. Experience the SkinVive glow.',
		tagline: 'for skin hydration and glow',
		whyChooseTitle: 'Expert SkinVive Treatment in Farragut, TN',
		whyChoose:
			'Discover SkinVive in Farragut at our convenient Campbell Station location. As a trusted Juvederm SkinVive provider in Farragut, TN, we deliver exceptional skin hydration treatments that transform dull, dehydrated complexions into glowing, healthy skin. If you are looking for a skin quality treatment in Farragut that goes beyond what topical products can achieve, SkinVive provides lasting hydration and radiance that our Farragut clients love.',
		ctaText: 'Book SkinVive in Farragut',
		sections: [
			{
				type: 'features-grid',
				title: 'Next-Level Skin Quality',
				items: [
					{
						title: 'Glass Skin Effect',
						description:
							'Get that coveted, ultra-smooth "glass skin" look popular in modern aesthetics.',
					},
					{
						title: '6 Months of Glow',
						description:
							'One treatment provides lasting hydration and radiance for up to half a year.',
					},
					{
						title: 'Minimal Downtime',
						description:
							'Return to your Farragut lifestyle immediately with little to no recovery time.',
					},
				],
			},
			{
				type: 'text-block',
				title: 'Hydration from Within',
				content:
					'Topical moisturizers only sit on the surface. SkinVive places water-attracting hyaluronic acid deep within the skin layers. This results in improved elasticity and a softness you can feel. It’s the ultimate skin quality booster for our Farragut clients.',
			},
		],
	},

	// ──────────────────────────────────────────────
	// KYBELLA
	// ──────────────────────────────────────────────
	'knoxville-kybella': {
		slug: 'knoxville-kybella',
		locationName: 'Knoxville',
		locationId: 'knoxville',
		serviceName: 'Kybella',
		serviceSlug: 'kybella',
		title: 'Kybella in Knoxville, TN | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Reduce double chin fat with Kybella at our Knoxville med spa on Kingston Pike. Non-surgical submental fat reduction with lasting results. Schedule now.',
		h1: 'Kybella in Knoxville',
		h2: 'Non-Surgical Double Chin Reduction in Knoxville',
		introParagraph:
			'Kybella is an FDA-approved injectable that permanently destroys fat cells beneath the chin, giving you a more defined jawline without surgery. At our Kingston Pike location in the Bearden area, Knoxville clients receive personalized Kybella treatment plans based on the degree of submental fullness and their desired outcome. Sarah carefully maps out each injection site to ensure even, natural-looking fat reduction.',
		bodyParagraph:
			'Our West Knoxville office is a popular choice for busy professionals who want to address a double chin without the downtime of liposuction. Conveniently located near downtown, our clinic provides a discreet setting where you can undergo treatment and resume your routine quickly. Most clients see noticeable improvement after two to four sessions, and the results are permanent once the fat cells are eliminated.',
		shortDescription:
			'Permanently reduce double chin fat at our Bearden office in Knoxville. Non-surgical sculpting for a defined profile.',
		tagline: 'for submental fat reduction',
		whyChooseTitle: 'Best Kybella Provider in Knoxville, TN',
		whyChoose:
			'For Kybella in Knoxville, Sarah Hitchcox Aesthetics offers expert double chin treatment and chin fat removal in Knoxville, TN. Our precise Kybella injections in Knoxville target stubborn submental fat that resists diet and exercise, giving you a sleeker, more defined jawline. As a leading provider of Kybella in the Knoxville area, we develop customized treatment plans that deliver permanent fat reduction with natural-looking contouring results.',
		ctaText: 'Book Kybella in Knoxville',
		sections: [
			{
				type: 'features-grid',
				title: 'Benefits of Kybella',
				items: [
					{
						title: 'Permanent Results',
						description:
							'Once fat cells are destroyed, they cannot store fat again. The results are lasting.',
					},
					{
						title: 'Defined Profile',
						description:
							'Sharpen your jawline and separate your chin from your neck for a sleeker profile.',
					},
					{
						title: 'Non-Surgical',
						description:
							'No scalpels, no stitches, and no general anesthesia required.',
					},
				],
			},
			{
				type: 'text-block',
				title: 'How It Works',
				content:
					'The active ingredient in Kybella is synthetic deoxycholic acid, a naturally occurring molecule in the body that aids in the breakdown and absorption of dietary fat. When injected into the fat beneath the chin, it destroys fat cells. Your body then naturally processes and eliminates them over the coming weeks.',
			},
		],
	},
	'farragut-kybella': {
		slug: 'farragut-kybella',
		locationName: 'Farragut',
		locationId: 'farragut',
		serviceName: 'Kybella',
		serviceSlug: 'kybella',
		title: 'Kybella in Farragut, TN | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Eliminate stubborn chin fat with Kybella near Campbell Station Road in Farragut. FDA-approved, non-surgical treatment. Book your consultation.',
		h1: 'Kybella in Farragut',
		h2: 'Non-Surgical Double Chin Reduction in Farragut',
		introParagraph:
			'If submental fullness has been affecting your confidence, our Farragut office near Campbell Station Road offers Kybella treatments that can help. This injectable uses a synthetic form of deoxycholic acid to break down and absorb dietary fat under the chin. The Farragut community can now access this transformative procedure close to home, in a private and relaxed environment.',
		bodyParagraph:
			'Farragut and West Knox residents appreciate having a trusted provider nearby for treatments that require multiple sessions. Our Turkey Creek-area location makes it easy to keep up with your Kybella schedule without rearranging your entire day. Sarah takes a measured approach to Kybella, gradually sculpting your chin profile over a series of visits so the change looks natural and refined.',
		shortDescription:
			'Eliminate stubborn chin fat without surgery at our Campbell Station location in Farragut. Define your jawline today.',
		tagline: 'for submental fat reduction',
		whyChooseTitle: 'Expert Kybella Double Chin Treatment in Farragut, TN',
		whyChoose:
			'Looking for Kybella in Farragut or double chin treatment near Farragut? Our Campbell Station office provides professional chin fat removal in Farragut, TN without surgery or significant downtime. Residents searching for Kybella near me in Farragut trust Sarah for her precise injection technique and personalized approach to submental fat reduction. Achieve a sculpted profile right here in your local community.',
		ctaText: 'Book Kybella in Farragut',
		sections: [
			{
				type: 'features-grid',
				title: 'Transform Your Profile',
				items: [
					{
						title: 'Double Chin Eraser',
						description:
							'Effectively targets the "double chin" area that is often resistant to diet and exercise.',
					},
					{
						title: 'Boosted Confidence',
						description:
							'Feel great in photos and from every angle with a sculpted, youthful neckline.',
					},
					{
						title: 'Gradual Improvement',
						description:
							'Changes appear over 4-6 weeks, offering a discreet transition that looks natural.',
					},
				],
			},
			{
				type: 'text-block',
				title: 'Is Kybella Right for You?',
				content:
					'Kybella is ideal for adults with moderate to severe fat below the chin. If you are bothered by submental fullness but want to avoid surgery, this treatment at our Farragut office is a powerful alternative. Sarah will assess your anatomy to ensure you are a good candidate.',
			},
		],
	},

	// ──────────────────────────────────────────────
	// MICRONEEDLING
	// ──────────────────────────────────────────────
	'knoxville-microneedling': {
		slug: 'knoxville-microneedling',
		locationName: 'Knoxville',
		locationId: 'knoxville',
		serviceName: 'Microneedling',
		serviceSlug: 'microneedling',
		title: 'Microneedling in Knoxville, TN | Sarah Hitchcox',
		metaDescription:
			'Professional microneedling at our Knoxville med spa on Kingston Pike. Reduce scars, fine lines, and uneven texture. Book your appointment today.',
		h1: 'Microneedling in Knoxville',
		h2: 'Advanced Microneedling Treatments in Knoxville',
		introParagraph:
			"Microneedling stimulates your skin's natural collagen production to improve texture, reduce scarring, and minimize fine lines. At our Kingston Pike office in the Bearden area, we use professional-grade microneedling devices that deliver precise, controlled treatments for optimal results. Knoxville clients benefit from a thorough skin assessment before each session, ensuring the treatment depth and approach are tailored to their specific concerns.",
		bodyParagraph:
			'Our West Knoxville location attracts clients from across the city who are looking for effective skin rejuvenation without invasive procedures. Convenient to downtown and surrounding neighborhoods, the office is easy to reach for regular treatment sessions. Sarah combines microneedling with targeted serums to amplify results, helping Knoxville residents achieve smoother, more even-toned skin that continues to improve in the weeks following each appointment.',
		shortDescription:
			'Improve skin texture and reduce scars at our Bearden office in Knoxville. Stimulate natural collagen production.',
		tagline: 'for acne scars and texture',
		whyChooseTitle: 'Best Microneedling Provider in Knoxville, TN',
		whyChoose:
			'For microneedling in Knoxville, Sarah Hitchcox Aesthetics offers professional collagen induction therapy in Knoxville, TN using medical-grade devices for superior results. Our treatments are especially effective as microneedling for acne scars in Knoxville, helping clients achieve dramatic improvements in skin texture. If you are searching for microneedling near me in Knoxville or a proven skin texture treatment in Knoxville, our Bearden office delivers visible, lasting results.',
		ctaText: 'Book Microneedling in Knoxville',
		sections: [
			{
				type: 'text-block',
				title: 'The Collagen Induction Process',
				content:
					'At our Knoxville clinic, we use medical-grade devices to create thousands of invisible micro-channels in the skin. This triggers a potent wound-healing response that floods the area with new collagen and elastin. It is a natural way to rebuild your skin from the inside out, making it thicker, firmer, and more resilient.',
			},
			{
				type: 'features-grid',
				title: 'Targeted Results',
				items: [
					{
						title: 'Scar Reduction',
						description:
							'Significantly improves the appearance of acne scars and other textural irregularities.',
					},
					{
						title: 'Pore Minimizing',
						description:
							'Tightens and refines enlarged pores for a smoother, porcelain-like finish.',
					},
					{
						title: 'Even Tone',
						description:
							'Helps break up hyperpigmentation and sun spots for a more uniform complexion.',
					},
				],
			},
		],
	},
	'farragut-microneedling': {
		slug: 'farragut-microneedling',
		locationName: 'Farragut',
		locationId: 'farragut',
		serviceName: 'Microneedling',
		serviceSlug: 'microneedling',
		title: 'Microneedling in Farragut, TN | Sarah Hitchcox',
		metaDescription:
			'Get microneedling treatments near Campbell Station Road in Farragut. Improve skin texture, tone, and scarring. Schedule your session today.',
		h1: 'Microneedling in Farragut',
		h2: 'Advanced Microneedling Treatments in Farragut',
		introParagraph:
			'Our Farragut office near Campbell Station Road brings professional microneedling to the doorstep of the Farragut community. This collagen-induction therapy creates tiny channels in the skin that trigger a powerful healing response, resulting in firmer, smoother, and more radiant skin over time. Whether you are addressing acne scars, sun damage, or early signs of aging, we develop a treatment protocol suited to your goals.',
		bodyParagraph:
			'Residents near Turkey Creek and throughout West Knox can access clinical-grade microneedling without a lengthy drive. Our Farragut location offers a quiet, comfortable setting where you can unwind during your treatment. Sarah pairs microneedling with nourishing growth-factor serums to maximize collagen stimulation, giving Farragut clients visible improvements in skin clarity and firmness after just a few sessions.',
		shortDescription:
			'Revitalize your skin with microneedling at our Campbell Station location in Farragut. Smoother, firmer skin awaits.',
		tagline: 'for acne scars and texture',
		whyChooseTitle: 'Top Microneedling Provider in Farragut, TN',
		whyChoose:
			'Discover microneedling in Farragut at our Campbell Station location, where we provide advanced microneedling for scars and skin rejuvenation in Farragut. Our clinical-grade treatments stimulate deep collagen renewal to smooth texture, reduce scarring, and restore a youthful glow. Residents searching for microneedling near me in Farragut, TN choose us for personalized protocols and proven results that keep skin looking its best year-round.',
		ctaText: 'Book Microneedling in Farragut',
		sections: [
			{
				type: 'text-block',
				title: 'Revitalize Your Skin in Farragut',
				content:
					'Our Farragut microneedling treatments are designed to reset your skin’s texture. By stimulating deep structural renewal, we can help smooth out rough patches, fine lines, and crêpey skin. It’s a favorite among our clients for maintaining a youthful, healthy glow year-round.',
			},
			{
				type: 'features-grid',
				title: 'Why Microneedling?',
				items: [
					{
						title: 'Anti-Aging Powerhouse',
						description:
							'Stimulates collagen to firm loose skin and reduce the appearance of wrinkles.',
					},
					{
						title: 'Brightening Effect',
						description:
							'Promotes cell turnover, replacing dull, dead skin cells with fresh, radiant tissue.',
					},
					{
						title: 'Safe for All Skin Types',
						description:
							'Unlike some lasers, microneedling is safe and effective for diverse skin tones.',
					},
				],
			},
		],
	},

	// ──────────────────────────────────────────────
	// SEMAGLUTIDE
	// ──────────────────────────────────────────────
	'knoxville-semaglutide': {
		slug: 'knoxville-semaglutide',
		locationName: 'Knoxville',
		locationId: 'knoxville',
		serviceName: 'Semaglutide & Tirzepatide Weight Loss',
		serviceSlug: 'semaglutide',
		title: 'Semaglutide Weight Loss in Knoxville | Hitchcox',
		metaDescription:
			'Medical weight loss with semaglutide and tirzepatide at our Knoxville med spa on Kingston Pike. Personalized plans for lasting results. Start today.',
		h1: 'Semaglutide & Tirzepatide Weight Loss in Knoxville',
		h2: 'Medically Supervised Weight Loss at Our Knoxville Office',
		introParagraph:
			'Our Kingston Pike office in the Bearden area offers medically supervised weight loss programs featuring semaglutide and tirzepatide. These GLP-1 receptor agonists have transformed the weight loss landscape, helping patients achieve significant, sustainable results when combined with lifestyle modifications. Knoxville clients receive a comprehensive initial assessment, regular check-ins, and dosage adjustments to ensure safe, effective progress.',
		bodyParagraph:
			"Conveniently located in West Knoxville and just minutes from downtown, our clinic makes it easy to stay on track with your weight loss journey. We understand that every patient's metabolism and health history are different, which is why Sarah develops individualized protocols rather than one-size-fits-all plans. Our Knoxville team provides ongoing support and guidance, so you never feel like you are navigating this process alone.",
		shortDescription:
			'Start your medical weight loss journey at our Bearden office in Knoxville. Personalized plans with ongoing support.',
		tagline: 'for sustainable weight loss',
		whyChooseTitle: 'Expert Semaglutide Weight Loss Clinic in Knoxville, TN',
		whyChoose:
			'Sarah Hitchcox Aesthetics is a leading medical weight loss clinic in Knoxville, TN offering semaglutide, Ozempic, and tirzepatide programs with full medical supervision. Our weight loss injections in Knoxville are paired with personalized lifestyle guidance for sustainable results. If you are searching for semaglutide in Knoxville or a trusted weight loss clinic in Knoxville, our Bearden office provides the expert support and customized protocols you need to reach your goals.',
		ctaText: 'Book Weight Loss Consult in Knoxville',
		sections: [
			{
				type: 'faq-accordion',
				title: 'Frequently Asked Questions',
				items: [
					{
						question: 'How does Semaglutide work?',
						answer:
							'Semaglutide mimics a natural hormone (GLP-1) that targets the brain’s appetite regulation centers. It helps you feel fuller faster and stay full longer, reducing overall calorie intake without the feeling of deprivation.',
					},
					{
						question: 'How much weight can I expect to lose?',
						answer:
							'While individual results vary, clinical trials and our own patient data show that many patients lose an average of 15% of their body weight when combined with diet and exercise.',
					},
					{
						question: 'Is the program supervised?',
						answer:
							'Yes. At our Knoxville office, your health is our priority. We monitor your progress, manage side effects, and adjust dosages to ensure you are losing weight safely and effectively.',
					},
				],
			},
		],
	},
	'farragut-semaglutide': {
		slug: 'farragut-semaglutide',
		locationName: 'Farragut',
		locationId: 'farragut',
		serviceName: 'Semaglutide & Tirzepatide Weight Loss',
		serviceSlug: 'semaglutide',
		title: 'Semaglutide Weight Loss in Farragut | Hitchcox',
		metaDescription:
			'Farragut medical weight loss with semaglutide and tirzepatide near Campbell Station Road. Personalized programs with ongoing support. Get started now.',
		h1: 'Semaglutide & Tirzepatide Weight Loss in Farragut',
		h2: 'Medically Supervised Weight Loss at Our Farragut Office',
		introParagraph:
			'The Farragut community can now access physician-grade weight loss treatments with semaglutide and tirzepatide at our office near Campbell Station Road. These medications work by regulating appetite and blood sugar levels, making it easier to maintain a calorie deficit without constant hunger. We pair every prescription with nutritional guidance and regular monitoring to keep your progress on course.',
		bodyParagraph:
			'For families and professionals in the Turkey Creek area and greater West Knox, our Farragut location offers a private, judgment-free space to pursue your health goals. We know that weight loss is deeply personal, and our approach reflects that with tailored dosing schedules and consistent follow-up appointments. Sarah and the Farragut team are committed to helping you reach and maintain a healthy weight with the support you deserve.',
		shortDescription:
			'Achieve your weight loss goals at our Campbell Station location in Farragut. Medically supervised and effective.',
		tagline: 'for sustainable weight loss',
		whyChooseTitle: 'Trusted Medical Weight Loss Clinic in Farragut, TN',
		whyChoose:
			'For semaglutide in Farragut, Ozempic, or tirzepatide weight loss programs, our Campbell Station office is the premier medical weight loss provider in Farragut, TN. We combine physician-grade weight loss injections with ongoing support and monitoring to help you achieve sustainable results. Residents searching for a weight loss clinic in Farragut trust Sarah for personalized protocols that fit their lifestyle and health goals.',
		ctaText: 'Book Weight Loss Consult in Farragut',
		sections: [
			{
				type: 'faq-accordion',
				title: 'Common Questions in Farragut',
				items: [
					{
						question: 'Semaglutide vs. Tirzepatide: What is the difference?',
						answer:
							'Tirzepatide acts on two hormone receptors (GLP-1 and GIP) while Semaglutide acts on one. This dual action can potentially lead to greater weight loss for some patients. Sarah will help determine which is right for you.',
					},
					{
						question: 'Do I have to exercise?',
						answer:
							'Medication is a tool, not a cure-all. For the best, most sustainable results, we encourage our Farragut clients to incorporate regular physical activity and a balanced diet into their routine.',
					},
					{
						question: 'How do I get started?',
						answer:
							'Simply book a consultation at our Farragut office. We will review your medical history, discuss your goals, and if you are a candidate, start you on a personalized path to weight loss.',
					},
				],
			},
		],
	},

	// ──────────────────────────────────────────────
	// EVERESSE
	// ──────────────────────────────────────────────
	'knoxville-everesse': {
		slug: 'knoxville-everesse',
		locationName: 'Knoxville',
		locationId: 'knoxville',
		serviceName: 'Everesse Skin Tightening',
		serviceSlug: 'everesse',
		title: 'Everesse Skin Tightening Knoxville | Hitchcox',
		metaDescription:
			'Tighten and firm your skin with Everesse at our Knoxville med spa on Kingston Pike. Non-invasive skin tightening with visible results. Book now.',
		h1: 'Everesse Skin Tightening in Knoxville',
		h2: 'Non-Invasive Skin Tightening at Our Knoxville Med Spa',
		introParagraph:
			'Everesse is a cutting-edge skin tightening treatment that uses advanced energy technology to stimulate deep collagen remodeling. At our Kingston Pike office in the Bearden area, Knoxville clients can address sagging skin on the face, neck, and body without surgery or significant downtime. Each session is customized to target your areas of concern and deliver progressive firming over the following weeks.',
		bodyParagraph:
			"Our West Knoxville location draws clients from across the city who want to combat laxity without going under the knife. Situated conveniently near downtown, the office is easy to fit into even the busiest schedules. Sarah evaluates your skin's elasticity and structure during a thorough consultation, then designs an Everesse protocol that tightens and lifts in a way that looks naturally youthful.",
		shortDescription:
			'Tighten and firm skin non-invasively at our Bearden office in Knoxville. innovative Everesse technology.',
		tagline: 'for skin tightening and lifting',
		whyChooseTitle: 'Best Everesse Skin Tightening in Knoxville, TN',
		whyChoose:
			'For skin tightening in Knoxville, Sarah Hitchcox Aesthetics offers Everesse in Knoxville, TN, an advanced non-surgical facelift alternative that firms and lifts sagging skin. Our skin firming treatment in Knoxville stimulates deep collagen remodeling for visible jawline tightening and overall facial rejuvenation. If you are looking for a non-surgical facelift in Knoxville or effective skin tightening near Bearden, our experienced team delivers results you can see and feel.',
		ctaText: 'Book Everesse in Knoxville',
		sections: [
			{
				type: 'features-grid',
				title: 'Firm, Lift, & Tighten',
				items: [
					{
						title: 'Non-Surgical Lift',
						description:
							'Achieve a lifted appearance without incisions, stitches, or long recovery times.',
					},
					{
						title: 'Collagen Boost',
						description:
							'Stimulates your body’s natural collagen production for long-lasting structural improvement.',
					},
					{
						title: 'Bearden Convenience',
						description:
							'Located centrally on Kingston Pike, perfect for a quick treatment during your day.',
					},
				],
			},
			{
				type: 'text-block',
				title: 'How Everesse Works',
				content:
					'Everesse utilizes targeted energy to heat the deeper layers of the dermis, causing immediate contraction of collagen fibers and triggering a long-term healing response. Over the course of several treatments, Knoxville clients notice smoother, tighter skin and a more defined contour.',
			},
		],
	},
	'farragut-everesse': {
		slug: 'farragut-everesse',
		locationName: 'Farragut',
		locationId: 'farragut',
		serviceName: 'Everesse Skin Tightening',
		serviceSlug: 'everesse',
		title: 'Everesse Skin Tightening Farragut | Hitchcox',
		metaDescription:
			'Experience Everesse skin tightening near Campbell Station Road in Farragut. Firm and lift skin non-invasively. Schedule your consultation today.',
		h1: 'Everesse Skin Tightening in Farragut',
		h2: 'Non-Invasive Skin Tightening at Our Farragut Med Spa',
		introParagraph:
			'Our Farragut office near Campbell Station Road is proud to offer Everesse, one of the most advanced non-invasive skin tightening treatments available today. This technology delivers controlled energy to the deeper layers of skin, triggering new collagen and elastin production that gradually firms and lifts. The Farragut community can now enjoy dramatic skin tightening results without the risks and recovery time of surgical options.',
		bodyParagraph:
			'Residents in the Turkey Creek area and throughout West Knox benefit from having an experienced Everesse provider just minutes away. Our Farragut location is designed for comfort and privacy, ensuring you feel relaxed throughout the treatment process. Sarah assesses your unique skin structure and creates a customized tightening plan that targets the specific areas where you want to see improvement, from jawline definition to smoother body contours.',
		shortDescription:
			'Lift and rejuvenate skin without surgery at our Campbell Station location in Farragut. Discover Everesse today.',
		tagline: 'for skin tightening and lifting',
		whyChooseTitle: 'Expert Everesse Skin Tightening in Farragut, TN',
		whyChoose:
			'Experience Everesse in Farragut, TN at our Campbell Station location for non-surgical skin tightening that delivers real, visible results. Our advanced treatment provides a jawline lift and overall skin firming without surgery or downtime. Farragut residents searching for skin tightening in Farragut trust us for professional, customized protocols that address laxity and restore youthful contours close to home.',
		ctaText: 'Book Everesse in Farragut',
		sections: [
			{
				type: 'features-grid',
				title: 'Rejuvenate Your Contours',
				items: [
					{
						title: 'Zero Downtime',
						description:
							'Return to your daily activities in Farragut immediately after your session.',
					},
					{
						title: 'Natural Looking',
						description:
							'Results develop gradually, so you look like a refreshed version of yourself.',
					},
					{
						title: 'Turkey Creek Access',
						description:
							'Conveniently located for West Knox residents looking for premium aesthetic care.',
					},
				],
			},
			{
				type: 'text-block',
				title: 'Why Choose Everesse?',
				content:
					'Unlike superficial treatments, Everesse goes deep to address the root cause of skin laxity. It is an excellent option for Farragut clients who are starting to see early signs of aging or those who want to maintain the results of previous procedures.',
			},
		],
	},

	// ──────────────────────────────────────────────
	// LASER HAIR REMOVAL
	// ──────────────────────────────────────────────
	'knoxville-laser-hair-removal': {
		slug: 'knoxville-laser-hair-removal',
		locationName: 'Knoxville',
		locationId: 'knoxville',
		serviceName: 'Laser Hair Removal',
		serviceSlug: 'laser-hair-removal',
		title: 'Laser Hair Removal Knoxville, TN | Hitchcox',
		metaDescription:
			'Smooth, hair-free skin with laser hair removal at our Knoxville med spa on Kingston Pike. Safe for all skin tones. Book your first session today.',
		h1: 'Laser Hair Removal in Knoxville',
		h2: 'Professional Laser Hair Removal at Our Knoxville Office',
		introParagraph:
			'Say goodbye to razors and waxing with professional laser hair removal at our Kingston Pike office in the Bearden area. Our advanced laser system targets hair follicles with precision, delivering long-lasting reduction across virtually any body area. Knoxville clients appreciate the speed and comfort of modern laser technology, which makes treatments faster and more tolerable than ever before.',
		bodyParagraph:
			'Located in West Knoxville and convenient to downtown, our office is the ideal place to start your laser hair removal journey. Most clients see significant reduction after a series of sessions spaced several weeks apart, and our Knoxville team builds a treatment timeline that fits your schedule. Sarah adjusts laser settings to match your skin tone and hair type, ensuring safe, effective results for a wide range of clients.',
		shortDescription:
			'Enjoy smooth, hair-free skin at our Bearden office in Knoxville. Safe, effective laser hair removal for all.',
		tagline: 'for smooth, hair-free skin',
		whyChooseTitle: 'Best Laser Hair Removal in Knoxville, TN',
		whyChoose:
			'For laser hair removal in Knoxville, Sarah Hitchcox Aesthetics provides safe, effective permanent hair reduction in Knoxville using advanced laser technology suitable for all skin tones. Our hair removal treatments in Knoxville, TN target unwanted hair at the root for long-lasting smoothness across any body area. If you are searching for laser hair removal near me in Knoxville, our Bearden office offers fast, comfortable sessions with results you will love.',
		ctaText: 'Book Laser Hair Removal in Knoxville',
		sections: [
			{
				type: 'features-grid',
				title: 'Experience Smooth Skin',
				items: [
					{
						title: 'Precision Targeting',
						description:
							'Selectively targets dark, coarse hairs while leaving the surrounding skin undamaged.',
					},
					{
						title: 'Speed & Comfort',
						description:
							'Treat large areas like legs or back quickly at our convenient Bearden location.',
					},
					{
						title: 'Long-Term Savings',
						description:
							'Save time and money over a lifetime by eliminating the need for daily shaving or monthly waxing.',
					},
				],
			},
			{
				type: 'text-block',
				title: 'Safe for All Skin Types',
				content:
					'Our Knoxville clinic utilizes state-of-the-art laser technology that can be safely adjusted for different skin tones. Whether you have fair skin or a darker complexion, we can create a customized plan to help you achieve permanent hair reduction safely.',
			},
		],
	},
	'farragut-laser-hair-removal': {
		slug: 'farragut-laser-hair-removal',
		locationName: 'Farragut',
		locationId: 'farragut',
		serviceName: 'Laser Hair Removal',
		serviceSlug: 'laser-hair-removal',
		title: 'Laser Hair Removal Farragut, TN | Hitchcox',
		metaDescription:
			'Get laser hair removal near Campbell Station Road in Farragut. Long-lasting smoothness for all skin types. Schedule your consultation now.',
		h1: 'Laser Hair Removal in Farragut',
		h2: 'Professional Laser Hair Removal at Our Farragut Office',
		introParagraph:
			'Our Farragut location near Campbell Station Road makes laser hair removal accessible and convenient for the entire Farragut community. Using state-of-the-art laser technology, we target unwanted hair at the root, progressively reducing growth with each session. Whether you want to treat your legs, underarms, bikini area, or face, our Farragut office provides a comfortable, private environment for every appointment.',
		bodyParagraph:
			'Families and professionals near Turkey Creek and across West Knox no longer need to travel far for expert laser hair removal. Our Farragut med spa uses equipment that is safe and effective across a variety of skin tones and hair textures. Sarah customizes each treatment plan based on your hair growth cycle and target areas, ensuring Farragut clients achieve the smoothest possible results with minimal discomfort.',
		shortDescription:
			'Ditch the razor with laser hair removal at our Campbell Station location in Farragut. Long-lasting smoothness.',
		tagline: 'for smooth, hair-free skin',
		whyChooseTitle: 'Top Laser Hair Removal Provider in Farragut, TN',
		whyChoose:
			'Our Farragut office provides expert laser hair removal in Farragut with advanced technology for safe, effective permanent hair reduction in Farragut. Whether you want to treat legs, underarms, or the bikini area, our hair removal services in Farragut, TN deliver smooth, lasting results. Residents searching for laser hair removal near me in Farragut choose us for customized treatment plans and a comfortable, private experience.',
		ctaText: 'Book Laser Hair Removal in Farragut',
		sections: [
			{
				type: 'features-grid',
				title: 'The Farragut Advantage',
				items: [
					{
						title: 'Local Convenience',
						description:
							'Easily accessible from Campbell Station Road and Turkey Creek for hassle-free appointments.',
					},
					{
						title: 'Advanced Tech',
						description:
							'We use the latest lasers to ensure treatments are as comfortable and effective as possible.',
					},
					{
						title: 'Silky Results',
						description:
							'Enjoy the confidence of smooth skin year-round, without the stubble or ingrown hairs.',
					},
				],
			},
			{
				type: 'text-block',
				title: 'How Many Sessions?',
				content:
					'Hair grows in cycles, and laser treatment is most effective during the active growth phase. For our Farragut clients, we typically recommend a series of 6-8 treatments to capture all hairs in the correct phase. Sarah will track your progress to ensure optimal clearance.',
			},
		],
	},

	// ──────────────────────────────────────────────
	// SKIN REVITALIZATION
	// ──────────────────────────────────────────────
	'knoxville-skin-revitalization': {
		slug: 'knoxville-skin-revitalization',
		locationName: 'Knoxville',
		locationId: 'knoxville',
		serviceName: 'Skin Revitalization',
		serviceSlug: 'skin-revitalization',
		title: 'Skin Revitalization Knoxville, TN | Hitchcox',
		metaDescription:
			'Revitalize dull, aging skin at our Knoxville med spa on Kingston Pike. Advanced treatments for tone, texture, and radiance. Book your session today.',
		h1: 'Skin Revitalization in Knoxville',
		h2: "Restore Your Skin's Natural Radiance in Knoxville",
		introParagraph:
			"Skin revitalization treatments at our Kingston Pike office in the Bearden area help Knoxville clients turn back the clock on sun damage, uneven tone, and dull complexion. Using advanced light and energy-based technology, we stimulate the skin's natural renewal processes to reveal a fresher, more luminous surface. Each treatment plan is customized after a thorough evaluation of your skin's current condition and your aesthetic goals.",
		bodyParagraph:
			"Our West Knoxville location is a favorite among clients who want to restore their skin's youthful glow without aggressive procedures. Convenient to downtown and the broader Knoxville area, our office fits easily into your weekly routine. Sarah recommends a series of sessions for cumulative improvement, and many Knoxville clients report noticeably brighter, smoother skin after just the first few treatments.",
		shortDescription:
			'Restore youthful radiance at our Bearden office in Knoxville. Treat sun damage and uneven tone effectively.',
		tagline: 'for tone and texture',
		whyChooseTitle: 'Best Skin Revitalization Treatment in Knoxville, TN',
		whyChoose:
			'For skin revitalization in Knoxville, our Bearden office offers advanced laser facial treatments and skin rejuvenation in Knoxville, TN that restore radiance, improve texture, and reverse signs of aging. Whether you are looking for a skin texture treatment in Knoxville or a comprehensive anti-aging treatment in Knoxville, Sarah develops customized protocols using cutting-edge technology. Our skin revitalization services help Knoxville clients achieve a brighter, smoother, more youthful complexion.',
		ctaText: 'Book Skin Revitalization in Knoxville',
		sections: [
			{
				type: 'features-grid',
				title: 'Renew & Refresh',
				items: [
					{
						title: 'Tone Correction',
						description:
							'Even out redness and discoloration for a more uniform, healthy-looking complexion.',
					},
					{
						title: 'Texture Refinement',
						description:
							'Smooth away roughness and minimize the appearance of pores.',
					},
					{
						title: 'Sun Damage Reversal',
						description:
							'Target the visible signs of sun aging that accumulate over time.',
					},
				],
			},
			{
				type: 'text-block',
				title: 'A Fresh Start for Your Skin',
				content:
					'Environmental factors and aging can leave skin looking tired. Our Knoxville skin revitalization therapies work to gently exfoliate and stimulate the dermis, encouraging the growth of healthy new cells. It is the perfect "reset" for anyone looking to brighten their appearance.',
			},
		],
	},
	'farragut-skin-revitalization': {
		slug: 'farragut-skin-revitalization',
		locationName: 'Farragut',
		locationId: 'farragut',
		serviceName: 'Skin Revitalization',
		serviceSlug: 'skin-revitalization',
		title: 'Skin Revitalization Farragut, TN | Hitchcox',
		metaDescription:
			'Refresh and rejuvenate your skin near Campbell Station Road in Farragut. Treat sun damage, dullness, and uneven tone. Schedule your appointment.',
		h1: 'Skin Revitalization in Farragut',
		h2: "Restore Your Skin's Natural Radiance in Farragut",
		introParagraph:
			'The Farragut community can access professional skin revitalization treatments at our office near Campbell Station Road. These advanced procedures use targeted energy to break down damaged cells and encourage the growth of fresh, healthy tissue. Whether your concerns are fine lines, age spots, or general dullness, our Farragut team designs a revitalization plan that addresses your unique skin profile.',
		bodyParagraph:
			"Located in the heart of the Turkey Creek area, our Farragut office serves West Knox residents who are ready to invest in their skin health. Skin revitalization works progressively, meaning results build beautifully over a series of sessions. Sarah takes the time to track your skin's response at each visit, adjusting the treatment parameters to ensure Farragut clients see continuous, visible improvement in clarity and evenness.",
		shortDescription:
			'Refresh dull, tired skin at our Campbell Station location in Farragut. Advanced treatments for a healthy glow.',
		tagline: 'for tone and texture',
		whyChooseTitle: 'Expert Skin Revitalization in Farragut, TN',
		whyChoose:
			'Discover skin revitalization in Farragut at our Campbell Station location, where we provide professional laser facial treatments and skin rejuvenation in Farragut for clients seeking a brighter, more youthful appearance. Our anti-aging treatments in Farragut target sun damage, dullness, and uneven tone using advanced energy-based technology. Farragut, TN residents trust us for customized skin revitalization protocols that deliver visible, lasting improvements.',
		ctaText: 'Book Skin Revitalization in Farragut',
		sections: [
			{
				type: 'features-grid',
				title: 'Glow with Confidence',
				items: [
					{
						title: 'Youthful Radiance',
						description:
							'Restore that natural "glow from within" that tends to fade with age.',
					},
					{
						title: 'Custom Protocols',
						description:
							'We tailor every session to your specific concerns, from brown spots to fine lines.',
					},
					{
						title: 'West Knox Convenience',
						description:
							'No need to drive into the city; expert skin care is right here in Farragut.',
					},
				],
			},
			{
				type: 'text-block',
				title: 'The Science of Revitalization',
				content:
					'By delivering precise energy to the skin, we trigger a "clean up" response where the body removes damaged tissue and produces fresh collagen. This leads to tighter, brighter skin that looks and feels revitalized. It’s a favorite maintenance treatment for our Farragut clientele.',
			},
		],
	},

	// ──────────────────────────────────────────────
	// PIGMENTED LESION REDUCTION
	// ──────────────────────────────────────────────
	'knoxville-pigmented-lesion-reduction': {
		slug: 'knoxville-pigmented-lesion-reduction',
		locationName: 'Knoxville',
		locationId: 'knoxville',
		serviceName: 'Pigmented Lesion Reduction',
		serviceSlug: 'pigmented-lesion-reduction',
		title: 'Pigmented Lesion Reduction Knoxville | Hitchcox',
		metaDescription:
			'Reduce dark spots and pigmented lesions at our Knoxville med spa on Kingston Pike. Advanced laser treatments for clearer skin. Book a consultation.',
		h1: 'Pigmented Lesion Reduction in Knoxville',
		h2: 'Clear Away Dark Spots at Our Knoxville Med Spa',
		introParagraph:
			'Unwanted pigmentation such as age spots, sun spots, and other discoloration can be effectively treated at our Kingston Pike office in the Bearden area. Using targeted laser energy, we break down excess melanin deposits so your body can naturally clear them away. Knoxville clients appreciate the precision of our approach, which treats pigmented areas without damaging the surrounding skin.',
		bodyParagraph:
			'Our West Knoxville location is ideal for anyone dealing with the visible effects of years of sun exposure. Convenient to downtown and neighboring communities, our clinic provides a focused treatment experience that addresses spots on the face, hands, chest, and other commonly affected areas. Sarah evaluates each lesion carefully and selects the optimal laser parameters to give Knoxville clients a clearer, more uniform complexion.',
		shortDescription:
			'Fade dark spots and sun damage at our Bearden office in Knoxville. Clearer, more even-toned skin starts here.',
		tagline: 'for sun spots and dark spots',
		whyChooseTitle:
			'Best Dark Spot & Pigmented Lesion Removal in Knoxville, TN',
		whyChoose:
			'For dark spot removal in Knoxville and professional pigmented lesion removal in Knoxville, TN, our Bearden office uses precision laser technology to target sun spots, age spots, and brown spots with outstanding results. Our sun spot treatment in Knoxville breaks down excess melanin so your body naturally clears discoloration, revealing a clearer, more even complexion. If you are searching for age spot treatment or brown spot removal in Knoxville, Sarah provides expert care tailored to your skin.',
		ctaText: 'Book Pigment Treatment in Knoxville',
		sections: [
			{
				type: 'features-grid',
				title: 'Targeted Clearance',
				items: [
					{
						title: 'Precision Laser',
						description:
							'We target only the pigmented lesion, leaving healthy surrounding tissue untouched.',
					},
					{
						title: 'Age Spot Removal',
						description:
							'Effectively fade the brown spots that can make skin look older than it is.',
					},
					{
						title: 'Fast Treatments',
						description:
							'Most spots can be treated in minutes at our convenient Knoxville office.',
					},
				],
			},
			{
				type: 'text-block',
				title: 'Restore Your Complexion',
				content:
					'Pigmented lesions are often the result of sun damage or hormonal changes. Our Knoxville treatments work by shattering the pigment into tiny particles that the body’s immune system then removes. Over a few weeks, the spots darken and flake off, revealing fresh, clear skin underneath.',
			},
		],
	},
	'farragut-pigmented-lesion-reduction': {
		slug: 'farragut-pigmented-lesion-reduction',
		locationName: 'Farragut',
		locationId: 'farragut',
		serviceName: 'Pigmented Lesion Reduction',
		serviceSlug: 'pigmented-lesion-reduction',
		title: 'Pigmented Lesion Reduction Farragut | Hitchcox',
		metaDescription:
			'Treat dark spots and sun damage near Campbell Station Road in Farragut. Expert pigmented lesion reduction for even-toned skin. Schedule now.',
		h1: 'Pigmented Lesion Reduction in Farragut',
		h2: 'Clear Away Dark Spots at Our Farragut Med Spa',
		introParagraph:
			'Our Farragut office near Campbell Station Road offers advanced pigmented lesion reduction for residents troubled by dark spots, sunspots, and hyperpigmentation. The treatment uses calibrated laser wavelengths to selectively target melanin deposits, lightening discoloration while leaving healthy skin intact. The Farragut community can now address these common skin concerns locally, with no need to travel to a larger city for specialized care.',
		bodyParagraph:
			'Living in the Turkey Creek area and greater West Knox means year-round sun exposure that can lead to stubborn pigmentation over time. Our Farragut med spa is equipped to handle a range of pigmented lesions, from small freckle-like spots to larger areas of uneven tone. Sarah develops a targeted treatment plan for each Farragut client, often combining laser sessions with protective skincare recommendations to prevent future discoloration.',
		shortDescription:
			'Reduce unwanted pigmentation at our Campbell Station location in Farragut. Target age spots and sun damage.',
		tagline: 'for sun spots and dark spots',
		whyChooseTitle:
			'Expert Pigmented Lesion & Dark Spot Removal in Farragut, TN',
		whyChoose:
			'Our Farragut office provides professional dark spot removal and sun spot treatment in Farragut, TN using advanced laser technology. Whether you are dealing with a pigmented lesion in Farragut or seeking age spot removal, our targeted approach lightens discoloration while preserving healthy surrounding skin. Farragut residents trust us for precise, effective treatments that restore an even, youthful complexion close to home.',
		ctaText: 'Book Pigment Treatment in Farragut',
		sections: [
			{
				type: 'features-grid',
				title: 'Even Tone, Even Better',
				items: [
					{
						title: 'Sun Damage Repair',
						description:
							'Reverse the signs of sun exposure on your face, décolletage, and hands.',
					},
					{
						title: 'Safe & Effective',
						description:
							'Clinically proven technology that is safe for the skin and delivers real results.',
					},
					{
						title: 'Local Expertise',
						description:
							'Expert assessment right here in Farragut to ensure benign lesions are treated correctly.',
					},
				],
			},
			{
				type: 'text-block',
				title: 'What to Expect',
				content:
					'After treatment, the pigmented area may darken temporarily before peeling away. This is a normal part of the process. Our Farragut clients love the final reveal—clearer, more youthful-looking skin free from distracting dark spots.',
			},
		],
	},

	// ──────────────────────────────────────────────
	// VASCULAR LESION REDUCTION
	// ──────────────────────────────────────────────
	'knoxville-vascular-lesion-reduction': {
		slug: 'knoxville-vascular-lesion-reduction',
		locationName: 'Knoxville',
		locationId: 'knoxville',
		serviceName: 'Vascular Lesion Reduction',
		serviceSlug: 'vascular-lesion-reduction',
		title: 'Vascular Lesion Reduction Knoxville | Hitchcox',
		metaDescription:
			'Treat spider veins, redness, and vascular lesions at our Knoxville med spa on Kingston Pike. Precise laser treatments for clearer skin. Book today.',
		h1: 'Vascular Lesion Reduction in Knoxville',
		h2: 'Reduce Redness and Visible Veins in Knoxville',
		introParagraph:
			'Visible blood vessels, spider veins, and persistent redness can be effectively minimized at our Kingston Pike office in the Bearden area. Our laser system delivers precise wavelengths that target hemoglobin in the blood vessels, causing them to collapse and be reabsorbed by the body. Knoxville clients struggling with rosacea, broken capillaries, or small spider veins on the face and legs find significant improvement through this treatment.',
		bodyParagraph:
			'Our West Knoxville location provides a clinical yet comfortable environment for vascular lesion treatments. Convenient to downtown and the wider Knoxville area, the office is accessible for initial consultations and follow-up sessions alike. Sarah assesses the size, depth, and location of each vascular concern before selecting the appropriate laser settings, ensuring that Knoxville clients receive safe, effective treatment with minimal bruising or downtime.',
		shortDescription:
			'Treat spider veins and redness at our Bearden office in Knoxville. Precise laser solutions for clear skin.',
		tagline: 'for spider veins and redness',
		whyChooseTitle:
			'Best Spider Vein & Vascular Lesion Treatment in Knoxville, TN',
		whyChoose:
			'For spider vein treatment in Knoxville and professional vascular lesion removal in Knoxville, TN, our Bearden office delivers precise laser treatments that target unwanted redness and visible veins. We specialize in rosacea treatment in Knoxville, facial redness treatment, and broken capillary treatment using advanced technology that seals damaged vessels without harming surrounding skin. If you struggle with persistent redness or spider veins, our Knoxville team provides effective, lasting solutions.',
		ctaText: 'Book Vascular Treatment in Knoxville',
		sections: [
			{
				type: 'features-grid',
				title: 'Clear Skin Solutions',
				items: [
					{
						title: 'Spider Vein Removal',
						description:
							'Diminish the appearance of unsightly spider veins on the legs and face.',
					},
					{
						title: 'Rosacea Management',
						description:
							'Reduce overall facial redness and flushing associated with rosacea.',
					},
					{
						title: 'Non-Invasive',
						description:
							'No needles or incisions required—just targeted light energy.',
					},
				],
			},
			{
				type: 'text-block',
				title: 'How Laser Vein Treatment Works',
				content:
					'The laser energy is absorbed by the blood within the vessel, generating heat that seals the vein walls. The body then naturally absorbs the treated vessel over time. Our Knoxville clients report seeing immediate fading in some cases, with full results developing over a few weeks.',
			},
		],
	},
	'farragut-vascular-lesion-reduction': {
		slug: 'farragut-vascular-lesion-reduction',
		locationName: 'Farragut',
		locationId: 'farragut',
		serviceName: 'Vascular Lesion Reduction',
		serviceSlug: 'vascular-lesion-reduction',
		title: 'Vascular Lesion Reduction Farragut | Hitchcox',
		metaDescription:
			'Reduce spider veins and facial redness near Campbell Station Road in Farragut. Expert laser vascular treatments. Schedule your consultation.',
		h1: 'Vascular Lesion Reduction in Farragut',
		h2: 'Reduce Redness and Visible Veins in Farragut',
		introParagraph:
			'Our Farragut office near Campbell Station Road specializes in laser-based vascular lesion reduction for clients dealing with unwanted redness, broken capillaries, and spider veins. The treatment works by directing focused light energy into the affected vessels, which heats and seals them without harming the overlying skin. Farragut community members can address these cosmetic concerns in a relaxed, professional setting close to home.',
		bodyParagraph:
			"For West Knox residents near Turkey Creek, having a skilled vascular lesion provider in Farragut means no more putting off treatment. Our office is designed for privacy and comfort, and most sessions take less than thirty minutes. Sarah carefully maps the treatment area and calibrates the laser for each Farragut client's specific vascular concerns, whether that is diffuse facial redness from rosacea or isolated spider veins on the legs.",
		shortDescription:
			'Minimize visible veins and redness at our Campbell Station location in Farragut. Effective vascular therapy.',
		tagline: 'for spider veins and redness',
		whyChooseTitle:
			'Expert Vascular Lesion & Rosacea Treatment in Farragut, TN',
		whyChoose:
			'Our Farragut office provides expert spider vein treatment and rosacea treatment in Farragut, TN for clients dealing with facial redness, broken capillaries, and visible veins. Using targeted laser energy, our vascular lesion treatments in Farragut safely collapse damaged vessels and restore a clear, even complexion. Farragut residents searching for effective vascular treatments trust our Campbell Station location for precise care and visible results.',
		ctaText: 'Book Vascular Treatment in Farragut',
		sections: [
			{
				type: 'features-grid',
				title: 'Effective Vein Therapy',
				items: [
					{
						title: 'Broken Capillaries',
						description:
							'Clear up those tiny red lines around the nose and cheeks.',
					},
					{
						title: 'Even Complexion',
						description:
							'Restore a more uniform skin tone free from distracting redness.',
					},
					{
						title: 'Quick & Convenient',
						description:
							'Located near Campbell Station Road for easy access from anywhere in Farragut.',
					},
				],
			},
			{
				type: 'text-block',
				title: 'Is it Painful?',
				content:
					'Most clients describe the sensation as a quick snap, like a rubber band against the skin. We use cooling techniques to ensure your comfort. Farragut residents appreciate the minimal downtime, allowing them to return to their day immediately.',
			},
		],
	},

	// ──────────────────────────────────────────────
	// HAIR LOSS PREVENTION & REGROWTH
	// ──────────────────────────────────────────────
	'knoxville-hair-loss-prevention-regrowth': {
		slug: 'knoxville-hair-loss-prevention-regrowth',
		locationName: 'Knoxville',
		locationId: 'knoxville',
		serviceName: 'Hair Loss Treatment',
		serviceSlug: 'hair-loss-prevention-regrowth',
		title: 'Hair Loss Treatment Knoxville, TN | Hitchcox',
		metaDescription:
			'Combat thinning hair at our Knoxville med spa on Kingston Pike. Advanced hair loss prevention and regrowth treatments. Book your consultation today.',
		h1: 'Hair Loss Treatment in Knoxville',
		h2: 'Hair Loss Prevention & Regrowth at Our Knoxville Office',
		introParagraph:
			'Thinning hair and hair loss affect both men and women, and our Kingston Pike office in the Bearden area provides advanced solutions to address these concerns head-on. We offer evidence-based treatments that stimulate dormant follicles and strengthen existing hair, helping Knoxville clients regain confidence in their appearance. During your initial consultation, Sarah evaluates the pattern and degree of hair loss to recommend the most effective treatment pathway.',
		bodyParagraph:
			'Conveniently situated in West Knoxville near downtown, our office makes it easy to commit to a consistent treatment schedule, which is critical for hair restoration success. We use a combination of growth-factor therapies and advanced technology to create an optimal environment for hair regrowth. Many Knoxville clients begin to notice reduced shedding within the first few weeks, with visible new growth following in the subsequent months.',
		shortDescription:
			'Combat thinning hair at our Bearden office in Knoxville. Proven treatments to prevent loss and stimulate growth.',
		tagline: 'for thinning hair and regrowth',
		whyChooseTitle: 'Best Hair Loss Treatment & Restoration in Knoxville, TN',
		whyChoose:
			'For hair loss treatment in Knoxville and professional hair restoration in Knoxville, TN, Sarah Hitchcox Aesthetics provides advanced solutions including microneedling for hair loss to stimulate dormant follicles and promote regrowth. Our thinning hair treatment in Knoxville combines growth-factor therapies with cutting-edge technology to deliver visible hair regrowth in Knoxville. If you are noticing thinning or shedding, our Bearden office provides personalized protocols designed to preserve and restore your hair.',
		ctaText: 'Book Hair Loss Consult in Knoxville',
		sections: [
			{
				type: 'features-grid',
				title: 'Restoring Confidence',
				items: [
					{
						title: 'Follicle Stimulation',
						description:
							'Awaken dormant hair follicles to encourage new, thicker growth.',
					},
					{
						title: 'Reduced Shedding',
						description:
							'Strengthen hair roots to minimize daily hair loss and breakage.',
					},
					{
						title: 'Custom Protocols',
						description:
							'Tailored treatment plans designed for your specific type of hair loss.',
					},
				],
			},
			{
				type: 'text-block',
				title: 'A Holistic Approach',
				content:
					'We believe in treating hair loss from multiple angles. Our Knoxville clinic combines in-office procedures with at-home care recommendations to maximize your results. Whether you are seeing the first signs of thinning or have more advanced loss, we have options to help.',
			},
		],
	},
	'farragut-hair-loss-prevention-regrowth': {
		slug: 'farragut-hair-loss-prevention-regrowth',
		locationName: 'Farragut',
		locationId: 'farragut',
		serviceName: 'Hair Loss Treatment',
		serviceSlug: 'hair-loss-prevention-regrowth',
		title: 'Hair Loss Treatment Farragut, TN | Hitchcox',
		metaDescription:
			'Restore thinning hair near Campbell Station Road in Farragut. Proven hair loss prevention and regrowth therapies. Schedule your consultation now.',
		h1: 'Hair Loss Treatment in Farragut',
		h2: 'Hair Loss Prevention & Regrowth at Our Farragut Office',
		introParagraph:
			'Our Farragut office near Campbell Station Road offers comprehensive hair loss treatments for men and women experiencing thinning or shedding. We combine cutting-edge therapies with personalized protocols to stimulate follicle activity and promote thicker, healthier hair growth. The Farragut community now has a dedicated local provider who understands the emotional impact of hair loss and approaches every case with expertise and sensitivity.',
		bodyParagraph:
			'Residents near Turkey Creek and across West Knox can maintain a convenient treatment schedule at our Farragut location, which is essential for achieving the best hair restoration outcomes. Sarah works closely with each Farragut client to track progress through photos and scalp assessments, adjusting the treatment plan as needed. Our goal is to slow further loss while encouraging robust regrowth, so you can feel confident about your hair again.',
		shortDescription:
			'Restore hair density and health at our Campbell Station location in Farragut. Personalized hair loss solutions.',
		tagline: 'for thinning hair and regrowth',
		whyChooseTitle: 'Expert Hair Loss Treatment & Restoration in Farragut, TN',
		whyChoose:
			'For hair loss treatment in Farragut and professional hair restoration in Farragut, TN, our Campbell Station office provides proven therapies that address thinning hair and stimulate hair regrowth. Whether you are experiencing early thinning in Farragut or more advanced loss, Sarah develops a customized hair regrowth treatment plan using advanced follicle-stimulation technology. Farragut residents trust us for compassionate, effective care that helps restore confidence and hair density.',
		ctaText: 'Book Hair Loss Consult in Farragut',
		sections: [
			{
				type: 'features-grid',
				title: 'Thicker, Healthier Hair',
				items: [
					{
						title: 'Non-Surgical',
						description:
							'Effective hair restoration without the need for transplant surgery.',
					},
					{
						title: 'Scalp Health',
						description:
							'Improve the condition of your scalp to support healthy hair growth.',
					},
					{
						title: 'Local Care',
						description:
							'Discreet, professional treatment right here in the Farragut area.',
					},
				],
			},
			{
				type: 'text-block',
				title: 'Start Early for Best Results',
				content:
					'Hair preservation is easier than restoration. If you notice thinning, acting quickly can save existing follicles. Our Farragut team is ready to assess your scalp and get you started on a path to hair recovery today.',
			},
		],
	},

	// ──────────────────────────────────────────────
	// TIRZEPATIDE
	// ──────────────────────────────────────────────
	'knoxville-tirzepatide': {
		slug: 'knoxville-tirzepatide',
		locationName: 'Knoxville',
		locationId: 'knoxville',
		serviceName: 'Tirzepatide Weight Loss',
		serviceSlug: 'tirzepatide',
		title: 'Tirzepatide in Knoxville, TN | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Medical weight loss with tirzepatide at our Knoxville med spa on Kingston Pike. Dual-action GLP-1/GIP therapy for lasting results. Start your journey today.',
		h1: 'Tirzepatide Weight Loss in Knoxville',
		h2: 'Dual-Action Medical Weight Loss at Our Knoxville Office',
		introParagraph:
			'Our Kingston Pike office in the Bearden area offers medically supervised tirzepatide weight loss programs that harness the power of dual GLP-1 and GIP receptor activation. Tirzepatide has emerged as one of the most effective weight loss medications available, helping patients achieve significant and sustainable results. Knoxville clients receive a thorough initial health assessment, regular progress check-ins, and careful dosage adjustments to ensure safe, steady weight loss throughout their journey.',
		bodyParagraph:
			"Conveniently located in West Knoxville just minutes from downtown, our clinic provides the ongoing medical support that makes tirzepatide therapy so effective. Sarah develops individualized treatment protocols based on each patient's unique metabolism, health history, and weight loss goals. Our Knoxville team pairs every tirzepatide prescription with nutritional counseling and lifestyle guidance, giving you the comprehensive support needed for lasting transformation.",
		shortDescription:
			'Achieve lasting weight loss with tirzepatide at our Bearden office in Knoxville. Dual-action therapy with full medical support.',
		tagline: 'for dual-action weight loss',
		whyChooseTitle: 'Best Tirzepatide Provider in Knoxville, TN',
		whyChoose:
			'Sarah Hitchcox Aesthetics is a leading tirzepatide weight loss clinic in Knoxville, TN offering medically supervised dual-action GLP-1/GIP therapy for sustainable results. Our weight loss injections in Knoxville combine tirzepatide with personalized lifestyle guidance for maximum effectiveness. If you are searching for tirzepatide in Knoxville, a weight loss clinic in Knoxville, or medical weight loss in Knoxville, TN, our Bearden office provides expert supervision and customized protocols to help you reach your goals.',
		ctaText: 'Book Tirzepatide Consult in Knoxville',
		sections: [
			{
				type: 'features-grid',
				title: 'Why Choose Tirzepatide in Knoxville?',
				items: [
					{
						title: 'Dual-Action Formula',
						description:
							'Tirzepatide targets both GLP-1 and GIP receptors, offering potentially greater weight loss than single-action medications.',
					},
					{
						title: 'Medically Supervised',
						description:
							'Every step of your journey is monitored with regular check-ins, lab work, and dosage adjustments at our Bearden office.',
					},
					{
						title: 'Personalized Plans',
						description:
							'We tailor your tirzepatide protocol to your unique metabolism, health history, and lifestyle for optimal results.',
					},
				],
			},
			{
				type: 'text-block',
				title: 'How Tirzepatide Works',
				content:
					'Tirzepatide is a dual-action injectable that activates both GLP-1 and GIP hormone receptors, reducing appetite and improving how your body processes food. Clinical trials have shown patients losing up to 20% or more of their body weight. At our Knoxville office, Sarah monitors your progress closely and adjusts your dosage to maximize results while minimizing side effects.',
			},
		],
	},
	'farragut-tirzepatide': {
		slug: 'farragut-tirzepatide',
		locationName: 'Farragut',
		locationId: 'farragut',
		serviceName: 'Tirzepatide Weight Loss',
		serviceSlug: 'tirzepatide',
		title: 'Tirzepatide in Farragut, TN | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Farragut medical weight loss with tirzepatide near Campbell Station Road. Dual-action GLP-1/GIP therapy with ongoing support. Get started now.',
		h1: 'Tirzepatide Weight Loss in Farragut',
		h2: 'Dual-Action Medical Weight Loss at Our Farragut Office',
		introParagraph:
			'The Farragut community can now access physician-grade tirzepatide weight loss therapy at our office near Campbell Station Road. This dual-action medication targets both GLP-1 and GIP receptors to regulate appetite and blood sugar levels more effectively than single-action alternatives. We pair every tirzepatide prescription with nutritional guidance and regular monitoring to keep your weight loss progress on track.',
		bodyParagraph:
			'For families and professionals in the Turkey Creek area and greater West Knox, our Farragut location offers a private, supportive space to pursue your health goals with tirzepatide. We understand that weight loss is deeply personal, and our approach reflects that with individualized dosing schedules, consistent follow-up appointments, and compassionate care. Sarah and the Farragut team are committed to helping you achieve and maintain a healthy weight with the dual-action power of tirzepatide.',
		shortDescription:
			'Start your tirzepatide weight loss journey at our Campbell Station location in Farragut. Medically supervised dual-action therapy.',
		tagline: 'for dual-action weight loss',
		whyChooseTitle: 'Trusted Tirzepatide Weight Loss Clinic in Farragut, TN',
		whyChoose:
			'For tirzepatide in Farragut, our Campbell Station office is a premier medical weight loss provider in Farragut, TN offering dual-action GLP-1/GIP therapy with full medical supervision. Our weight loss injections in Farragut combine tirzepatide with ongoing support and monitoring for sustainable results. Residents searching for a weight loss clinic in Farragut or tirzepatide near me trust Sarah for personalized protocols that fit their lifestyle and health goals.',
		ctaText: 'Book Tirzepatide Consult in Farragut',
		sections: [
			{
				type: 'features-grid',
				title: 'Tirzepatide in Farragut: What Sets It Apart',
				items: [
					{
						title: 'Greater Weight Loss Potential',
						description:
							'Dual-receptor activation may deliver superior results compared to single-action GLP-1 medications alone.',
					},
					{
						title: 'Ongoing Medical Support',
						description:
							'Regular check-ins and dosage adjustments at our Campbell Station office keep your progress on track.',
					},
					{
						title: 'Convenient Local Access',
						description:
							'No need to travel far—get expert tirzepatide therapy right here near Turkey Creek in Farragut.',
					},
				],
			},
			{
				type: 'text-block',
				title: 'Is Tirzepatide Right for You?',
				content:
					'Tirzepatide is ideal for adults looking for a powerful, medically supervised weight loss solution. At our Farragut office, Sarah reviews your medical history, discusses your goals, and determines whether tirzepatide is the best fit. Many patients see significant results within the first few months when combined with healthy lifestyle changes.',
			},
		],
	},

	// ──────────────────────────────────────────────
	// JEUVEAU
	// ──────────────────────────────────────────────
	'knoxville-jeuveau': {
		slug: 'knoxville-jeuveau',
		locationName: 'Knoxville',
		locationId: 'knoxville',
		serviceName: 'Jeuveau',
		serviceSlug: 'jeuveau',
		title: 'Jeuveau in Knoxville, TN | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Get Jeuveau wrinkle-relaxer injections at our Knoxville med spa on Kingston Pike in Bearden. Modern Botox alternative with natural results. Book today.',
		h1: 'Jeuveau in Knoxville',
		h2: 'Modern Wrinkle-Relaxer Injections at Our Knoxville Med Spa',
		introParagraph:
			'Jeuveau, often called "Newtox," is a modern wrinkle-relaxer designed with aesthetics as its sole purpose. At our Kingston Pike office in the heart of the Bearden area, Knoxville clients can experience this next-generation neurotoxin that smooths frown lines, forehead wrinkles, and crow\'s feet with precision and finesse. Sarah Hitchcox brings years of injection expertise to every Jeuveau appointment, ensuring natural-looking results that soften lines without sacrificing your natural expression.',
		bodyParagraph:
			'West Knoxville residents love having a trusted Jeuveau provider right in their neighborhood. Our Kingston Pike location offers private treatment rooms and a calm atmosphere where you can relax during your session. Jeuveau is purpose-built for cosmetic use and offers competitive pricing, making it an attractive alternative for clients who want premium wrinkle-relaxing results. Whether you are a first-time patient or switching from another neurotoxin, our Knoxville team will guide you through a personalized treatment plan.',
		shortDescription:
			'Smooth frown lines and wrinkles with Jeuveau at our Bearden office in Knoxville. A modern, aesthetic-focused neurotoxin.',
		tagline: 'for frown lines and wrinkles',
		whyChooseTitle: 'Best Jeuveau Injector in Knoxville, TN',
		whyChoose:
			"If you are searching for Jeuveau in Knoxville or Newtox injections in Knoxville, TN, Sarah Hitchcox Aesthetics is the premier choice. As one of the most trusted Jeuveau providers near Knoxville, we specialize in frown line treatment, forehead wrinkle reduction, and crow's feet treatment using this modern, aesthetic-focused neurotoxin. Whether you need an experienced Jeuveau injector in Knoxville or want to explore wrinkle relaxers near me in the Bearden and West Knoxville area, our skilled team delivers natural, refreshed results.",
		ctaText: 'Book Jeuveau in Knoxville',
		sections: [
			{
				type: 'features-grid',
				title: 'Why Choose Jeuveau in Knoxville?',
				items: [
					{
						title: 'Built for Aesthetics',
						description:
							'Unlike other neurotoxins with medical origins, Jeuveau was designed exclusively for cosmetic wrinkle treatment.',
					},
					{
						title: 'Natural Results',
						description:
							'Our precise injection technique ensures you look refreshed and rested, never frozen or overdone.',
					},
					{
						title: 'Bearden Convenience',
						description:
							'Centrally located on Kingston Pike, easily accessible from Downtown, Sequoyah Hills, and West Knoxville.',
					},
				],
			},
			{
				type: 'text-block',
				title: 'What to Expect with Jeuveau',
				content:
					'Jeuveau works by temporarily relaxing the facial muscles responsible for dynamic wrinkles. Results typically begin to appear within 2-3 days, with full effect at about 14 days. Sessions take just 15-30 minutes, making Jeuveau the perfect lunch-break treatment for our Knoxville clients seeking a quick, effective refresh.',
			},
		],
	},
	'farragut-jeuveau': {
		slug: 'farragut-jeuveau',
		locationName: 'Farragut',
		locationId: 'farragut',
		serviceName: 'Jeuveau',
		serviceSlug: 'jeuveau',
		title: 'Jeuveau in Farragut, TN | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Farragut Jeuveau wrinkle-relaxer treatments near Campbell Station Road. Modern Botox alternative with natural, refreshed results. Schedule today.',
		h1: 'Jeuveau in Farragut',
		h2: 'Modern Wrinkle-Relaxer Injections at Our Farragut Med Spa',
		introParagraph:
			'Conveniently located near Campbell Station Road, our Farragut office brings premium Jeuveau treatments to the heart of the Farragut community. Known as "Newtox," Jeuveau is a next-generation wrinkle-relaxer built exclusively for cosmetic use that smooths frown lines, forehead wrinkles, and crow\'s feet. If you live or work near Turkey Creek, you can pop in for a quick Jeuveau session and get back to your day in no time.',
		bodyParagraph:
			'The Farragut community deserves access to the latest aesthetic treatments without a long drive. Jeuveau offers competitive pricing and is purpose-built for cosmetic wrinkle reduction, making it an excellent option for Farragut residents exploring neurotoxin treatments. With a focus on precise, conservative injections, Sarah ensures your Jeuveau results complement your natural features and keep you looking like yourself, only more refreshed and confident.',
		shortDescription:
			'Refresh your look with Jeuveau at our Campbell Station location in Farragut. Modern wrinkle-relaxer with natural results.',
		tagline: 'for frown lines and wrinkles',
		whyChooseTitle: 'Top-Rated Jeuveau Provider in Farragut, TN',
		whyChoose:
			'Looking for Jeuveau in Farragut or Newtox injections in Farragut, TN? Our Campbell Station location makes it easy to get premium wrinkle-relaxer treatment in Farragut without a long drive. We are known as one of the best Jeuveau providers in Farragut, offering frown line treatment and forehead wrinkle reduction for patients of all ages. Residents searching for Jeuveau near me in Farragut trust us for natural, conservative results that keep you looking like yourself.',
		ctaText: 'Book Jeuveau in Farragut',
		sections: [
			{
				type: 'features-grid',
				title: "Farragut's Modern Wrinkle-Relaxer Experience",
				items: [
					{
						title: 'Turkey Creek Access',
						description:
							'Just moments away from the Turkey Creek shopping district, perfect for a post-shopping refresh.',
					},
					{
						title: 'Aesthetic-First Formula',
						description:
							'Jeuveau was developed from the ground up for cosmetic use, delivering smooth, reliable results.',
					},
					{
						title: 'Tailored Dosing',
						description:
							'We customize every unit to your unique muscle strength and aesthetic goals for a natural look.',
					},
				],
			},
			{
				type: 'text-block',
				title: 'Look Like You, Only Refreshed',
				content:
					"Our Farragut clients appreciate our conservative approach to Jeuveau. We believe the best injectable work goes unnoticed—friends will simply tell you that you look great. Whether smoothing forehead lines, crow's feet, or frown lines, Jeuveau enhances your natural beauty with precision at our Farragut office.",
			},
		],
	},

	// ──────────────────────────────────────────────
	// DYSPORT
	// ──────────────────────────────────────────────
	'knoxville-dysport': {
		slug: 'knoxville-dysport',
		locationName: 'Knoxville',
		locationId: 'knoxville',
		serviceName: 'Dysport',
		serviceSlug: 'dysport',
		title: 'Dysport in Knoxville, TN | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Expert Dysport injections at our Knoxville med spa on Kingston Pike in Bearden. Fast-acting wrinkle treatment with natural results. Book your session.',
		h1: 'Dysport in Knoxville',
		h2: 'Fast-Acting Wrinkle Treatment at Our Knoxville Med Spa',
		introParagraph:
			"Dysport is a fast-acting neurotoxin that excels at smoothing moderate to severe frown lines between the eyebrows and across the forehead. At our Kingston Pike office in the Bearden area, Knoxville clients enjoy the benefits of Dysport's unique formulation, which spreads naturally over broader treatment areas for a soft, even result. Sarah Hitchcox brings precision and artistry to every Dysport session, ensuring you walk out looking refreshed and naturally youthful.",
		bodyParagraph:
			'Our West Knoxville location on Kingston Pike provides a welcoming environment for both first-time neurotoxin patients and experienced clients looking to switch to Dysport. Many Knoxville patients prefer Dysport for its rapid onset—results can appear within 24 hours for some patients—and its ability to create a smooth, natural look over larger areas. Sessions take just 15-20 minutes, making it one of the fastest aesthetic treatments available at our Bearden office.',
		shortDescription:
			'Smooth frown lines quickly with Dysport at our Bearden office in Knoxville. Fast-acting results that look natural.',
		tagline: 'for fast-acting wrinkle smoothing',
		whyChooseTitle: 'Best Dysport Injector in Knoxville, TN',
		whyChoose:
			"If you are searching for Dysport in Knoxville or Dysport injections in Knoxville, TN, Sarah Hitchcox Aesthetics delivers expert wrinkle treatment with this fast-acting neurotoxin. As one of the most trusted Dysport providers near Knoxville, we specialize in frown line treatment and forehead wrinkle reduction using Dysport's unique spreading properties for soft, natural coverage. Whether you need an experienced Dysport injector in Knoxville or want to explore wrinkle treatments near me in Bearden and West Knoxville, our team provides beautiful, refreshed results.",
		ctaText: 'Book Dysport in Knoxville',
		sections: [
			{
				type: 'features-grid',
				title: 'Why Choose Dysport in Knoxville?',
				items: [
					{
						title: 'Fast Results',
						description:
							'Dysport can take effect within 24 hours for some patients, making it one of the quickest-acting neurotoxins available.',
					},
					{
						title: 'Natural Spread',
						description:
							'Its unique formulation diffuses evenly across treatment areas for a smooth, un-frozen look.',
					},
					{
						title: 'Bearden Convenience',
						description:
							'Located centrally on Kingston Pike, easily accessible from Downtown, Sequoyah Hills, and West Knoxville.',
					},
				],
			},
			{
				type: 'text-block',
				title: 'What Makes Dysport Different?',
				content:
					'Dysport uses a slightly smaller protein molecule than some other neurotoxins, which allows it to spread more naturally across treated areas. This makes it especially effective for broader zones like the forehead. Results typically last 3-4 months, and our Knoxville clients love the soft, even finish that Dysport provides.',
			},
		],
	},
	'farragut-dysport': {
		slug: 'farragut-dysport',
		locationName: 'Farragut',
		locationId: 'farragut',
		serviceName: 'Dysport',
		serviceSlug: 'dysport',
		title: 'Dysport in Farragut, TN | Sarah Hitchcox Aesthetics',
		metaDescription:
			'Farragut Dysport wrinkle treatments near Campbell Station Road. Fast-acting neurotoxin with natural, refreshed results. Schedule your appointment now.',
		h1: 'Dysport in Farragut',
		h2: 'Fast-Acting Wrinkle Treatment at Our Farragut Med Spa',
		introParagraph:
			"Our Farragut office near Campbell Station Road offers Dysport, a fast-acting neurotoxin that smooths frown lines and forehead wrinkles with a soft, natural finish. Dysport's unique formulation spreads evenly over treatment areas, making it an excellent choice for clients who want broad, seamless wrinkle reduction. If you live or work near Turkey Creek, you can stop in for a quick Dysport session and return to your day looking refreshed in no time.",
		bodyParagraph:
			'The Farragut community deserves access to top-tier neurotoxin options close to home. Dysport is a favorite among patients who appreciate its rapid onset—many see results within just a day or two—and its smooth, even coverage across the forehead and brow area. Our Campbell Station location provides a comfortable, boutique experience where Sarah customizes every Dysport treatment to your unique facial anatomy and aesthetic goals.',
		shortDescription:
			'Get fast-acting Dysport treatments at our Campbell Station location in Farragut. Smooth, natural wrinkle reduction.',
		tagline: 'for fast-acting wrinkle smoothing',
		whyChooseTitle: 'Top-Rated Dysport Provider in Farragut, TN',
		whyChoose:
			'Looking for Dysport in Farragut or Dysport injections in Farragut, TN? Our Campbell Station location makes it easy to get fast-acting wrinkle treatment in Farragut without a long drive. We are known as one of the best Dysport providers in Farragut, offering expert frown line and forehead wrinkle reduction with natural-looking results. Residents searching for Dysport near me in Farragut trust us for precise, comfortable injections and a soft, even finish.',
		ctaText: 'Book Dysport in Farragut',
		sections: [
			{
				type: 'features-grid',
				title: "Farragut's Fast-Acting Wrinkle Solution",
				items: [
					{
						title: 'Rapid Onset',
						description:
							'Many patients see Dysport results within 24-48 hours, faster than most other neurotoxins.',
					},
					{
						title: 'Smooth Coverage',
						description:
							"Dysport's natural diffusion creates an even, seamless result across the forehead and brow.",
					},
					{
						title: 'Turkey Creek Access',
						description:
							'Conveniently located near Turkey Creek for easy access from anywhere in West Knox and Farragut.',
					},
				],
			},
			{
				type: 'text-block',
				title: 'Is Dysport Right for You?',
				content:
					'Dysport is an excellent option for anyone seeking fast, natural-looking wrinkle reduction. It is particularly well-suited for treating broader areas like the forehead. At our Farragut office, Sarah will evaluate your facial muscles and aesthetic goals to determine if Dysport is the ideal neurotoxin for your needs.',
			},
		],
	},
}

export function getLocationServices(locationId: string) {
	return Object.values(locationServices).filter(
		service => service.locationId === locationId,
	)
}
