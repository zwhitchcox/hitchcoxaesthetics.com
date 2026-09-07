/**
 * Blog posts for hitchcoxaesthetics.com.
 *
 * These exist for two reasons. First, the site had no editorial content at
 * all, which left nothing for a press mention or a network-site link to
 * point at other than a service page. Second, the expired domains we own
 * carry editorial links aimed at specific dead post URLs (BuzzFeed at a
 * hand-cream review, Bustle at a neroli-oil post). Those URLs now redirect
 * here, so each post below is written to genuinely serve a reader who
 * clicked that original link.
 *
 * Every post is general skincare education reviewed by an RN. Nothing here
 * is medical advice, and no post promises a treatment outcome.
 */

export type BlogSection =
	| { type: 'p'; text: string }
	| { type: 'h2'; text: string }
	| { type: 'ul'; items: string[] }
	/** Bordered callout, for notices that must not read as body copy. */
	| { type: 'note'; text: string }

export type BlogPost = {
	slug: string
	title: string
	description: string
	/** Shown under the title. */
	summary: string
	published: string
	image: string
	imageAlt: string
	sections: BlogSection[]
	/** Related service pages on this site, rendered as internal links. */
	related: Array<{ href: string; label: string }>
}

export const blogPosts: BlogPost[] = [
	{
		slug: 'hand-cream-and-hand-aging',
		title: 'Why Hands Age Faster Than the Face',
		description:
			'Hands get washed constantly, rarely wear sunscreen, and have less oil-producing tissue. What actually helps, and where creams stop working.',
		summary:
			'Hands take more punishment than any other skin on the body and get the least attention.',
		published: '2026-08-03',
		image: '/img/blog/hand-care.jpg',
		imageAlt: 'Hand cream and soap on a folded towel',
		sections: [
			{
				type: 'p',
				text: 'Hands are washed a dozen times a day, are almost never included in a sunscreen routine, and have less oil-producing tissue than the face to begin with. That combination is why they often look older than the person they belong to.',
			},
			{ type: 'h2', text: 'What a hand cream is actually doing' },
			{
				type: 'p',
				text: 'Good hand creams do two separate jobs. Humectants such as glycerin and urea pull water into the outer layer of skin. Occlusives such as petrolatum, dimethicone and shea butter sit on top and slow that water escaping. A humectant on its own, in dry indoor air, can leave skin worse off, because the water it draws up simply evaporates.',
			},
			{
				type: 'p',
				text: 'The habit matters more than the product. Applying within a minute of washing, while skin is still slightly damp, does more than upgrading to an expensive cream. Overnight, a thick layer under cotton gloves resolves most seasonal cracking within a few days.',
			},
			{ type: 'h2', text: 'Where creams stop and treatment starts' },
			{
				type: 'p',
				text: 'Moisturiser addresses dryness. It does not address the two things people usually dislike about aging hands: sun spots and lost volume. Brown spots on the backs of the hands are accumulated UV damage, and crepey thinning is a loss of underlying support that no topical product reaches.',
			},
			{
				type: 'p',
				text: 'Those are treatable, but with different tools. Pigment responds to laser and light-based treatment. Volume loss is a filler conversation. An honest assessment will tell you which of the three you are actually dealing with, and often it is more than one.',
			},
			{ type: 'h2', text: 'When it is not just dry skin' },
			{
				type: 'p',
				text: 'Cracking that bleeds, itching that persists, or defined patches that spread may be eczema or contact dermatitis rather than simple dryness. Those need treating rather than moisturising, and a professional can tell the difference quickly.',
			},
		],
		related: [
			{ href: '/laser-services', label: 'Laser treatments' },
			{ href: '/filler', label: 'Dermal filler' },
			{ href: '/skin-revitalization', label: 'Skin revitalization' },
		],
	},
	{
		slug: 'essential-oils-and-your-skin',
		title: 'Essential Oils and Your Skin: A Nurse’s Take',
		description:
			'Neroli, lavender, tea tree and citrus oils are marketed as gentle. Botanicals cause a large share of cosmetic allergies. How to use them safely.',
		summary:
			'Natural is a marketing word, not a safety category. Some of the most reliable irritants in cosmetics come straight from plants.',
		published: '2026-08-03',
		image: '/img/blog/essential-oils.jpg',
		imageAlt: 'Amber dropper bottle beside orange blossoms',
		sections: [
			{
				type: 'p',
				text: 'Essential oils occupy an odd place in skincare. They are sold as the gentle option, and they are responsible for a meaningful share of contact allergy cases. Lavender, tea tree, citrus oils and neroli all appear on both lists.',
			},
			{ type: 'h2', text: 'What they reasonably do' },
			{
				type: 'p',
				text: 'Neroli, distilled from bitter orange blossom, is mildly antimicrobial and pleasant to use. As a fragrance in a well-made product it is unobjectionable for most skin. What it does not do is tighten pores, reverse wrinkles, or replace a moisturiser. Essential oils are volatile aromatic compounds, not treatments.',
			},
			{ type: 'h2', text: 'Dilution is not optional' },
			{
				type: 'p',
				text: 'Undiluted essential oil applied directly to skin is the most common cause of reactions blamed on natural products. If you use them at home, keep them to roughly one percent of a carrier oil, about one drop per teaspoon, and patch test on the inner forearm for a day before anything goes near your face.',
			},
			{
				type: 'ul',
				items: [
					'Citrus-derived oils can increase sun sensitivity, so keep them out of daytime products.',
					'Skip them entirely with eczema, rosacea, or any history of reacting to fragrance.',
					'"Unscented" often means a masking fragrance was added. "Fragrance-free" is the term that means what you want.',
				],
			},
			{ type: 'h2', text: 'When a home routine has run out of road' },
			{
				type: 'p',
				text: 'If a persistent concern is what sent you looking for a botanical fix, an oil is unlikely to resolve it. Texture, tone and pigment changes respond to treatments that work below the surface, and a professional assessment will save months of experimenting.',
			},
		],
		related: [
			{ href: '/skin-revitalization', label: 'Skin revitalization' },
			{ href: '/pigmented-lesion-reduction', label: 'Pigment treatment' },
			{ href: '/laser-services', label: 'Laser treatments' },
		],
	},
	{
		slug: 'what-actually-firms-skin',
		title: 'What Actually Firms Skin, and What Just Sits There',
		description:
			'Firming creams deliver a few hours of hydration. Retinoids, sunscreen and energy-based treatment do the structural work. An honest breakdown.',
		summary:
			'"Firming" is one of the least regulated words in skincare, and it describes a feeling as often as a result.',
		published: '2026-08-03',
		image: '/img/blog/firming.jpg',
		imageAlt: 'Open jar of face cream on a marble surface',
		sections: [
			{
				type: 'p',
				text: 'Most firming creams produce an immediate tightening sensation from film formers and humectants. Skin holds more water, looks plumper, and the effect is gone by evening. That is hydration. It is worth having, and it is not structural change.',
			},
			{ type: 'h2', text: 'Ingredients with real evidence' },
			{
				type: 'ul',
				items: [
					'Retinoids have the strongest record for stimulating collagen over months of consistent use.',
					'Vitamin C supports collagen synthesis and helps with overall tone.',
					'Peptides show modest benefit in studies, well short of the marketing.',
					'Sunscreen outperforms every firming cream sold, because most visible laxity is accumulated sun damage.',
				],
			},
			{ type: 'h2', text: 'Where topical products stop' },
			{
				type: 'p',
				text: 'Once laxity is structural, from lost volume or genuinely loose tissue, no cream reaches it. That is not a product failure, it is anatomy. Energy-based treatments work at a depth topicals cannot, and injectables replace volume rather than hydrating the surface above it.',
			},
			{
				type: 'p',
				text: 'The useful question is which side of that line your concern sits on. It is a short conversation with someone qualified to look, and it is the difference between a routine that works and a shelf of half-used jars.',
			},
		],
		related: [
			{ href: '/everesse', label: 'Everesse skin tightening' },
			{ href: '/filler', label: 'Dermal filler' },
			{ href: '/skin-revitalization', label: 'Skin revitalization' },
		],
	},
	{
		slug: 'acne-what-helps-and-what-hurts',
		title: 'Acne: What Helps, What Hurts, and When to Stop Guessing',
		description:
			'Which drugstore ingredients have evidence, which kitchen remedies damage the skin barrier, and the point at which home treatment stops being sensible.',
		summary:
			'Acne is common, stubborn, and surrounded by advice. Several popular home remedies actively make it worse.',
		published: '2026-08-03',
		image: '/img/blog/acne.jpg',
		imageAlt: 'Cleanser and cotton pads on a white tile counter',
		sections: [
			{
				type: 'p',
				text: 'Acne is a medical condition, not a hygiene failure. That single reframe changes what you try, because scrubbing harder and drying skin out are the two instincts that reliably make it worse.',
			},
			{ type: 'h2', text: 'Reasonable at home' },
			{
				type: 'ul',
				items: [
					'Gentle cleansing twice daily, without scrubbing.',
					'Benzoyl peroxide or salicylic acid, both available over the counter with real evidence behind them.',
					'A non-comedogenic moisturiser. Drying skin out triggers more oil, not less.',
					'Leaving spots alone. Picking causes the scars people later want treated.',
				],
			},
			{ type: 'h2', text: 'Popular and best avoided' },
			{
				type: 'p',
				text: 'Lemon juice and undiluted vinegar are acidic enough to burn and raise sun sensitivity. Toothpaste irritates without treating anything. Baking soda strips the barrier that lets skin defend itself. Coconut oil is comedogenic for most faces.',
			},
			{ type: 'h2', text: 'When to get help' },
			{
				type: 'p',
				text: 'Deep or painful cysts, any scarring, or three months of consistent over-the-counter use without change all mean further experimenting is unlikely to help. Prescription options exist and work, and preventing scarring is far easier than correcting it later.',
			},
		],
		related: [
			{ href: '/skin-revitalization', label: 'Skin revitalization' },
			{ href: '/laser-services', label: 'Laser treatments' },
			{ href: '/pigmented-lesion-reduction', label: 'Pigment treatment' },
		],
	},
	{
		slug: 'a-brief-history-of-cosmetics',
		title: 'A Brief History of Cosmetics',
		description:
			'Six thousand years of makeup, from Egyptian kohl to lead face paint to the 1938 law that created cosmetic safety. What that history still teaches.',
		summary:
			'People have worn cosmetics for at least six thousand years. For most of that time, nobody checked whether they were safe.',
		published: '2026-08-03',
		image: '/img/blog/cosmetics-history.jpg',
		imageAlt:
			'Antique cosmetic vessels including a kohl pot, powder compact and perfume bottle on a wooden table',
		sections: [
			{
				type: 'p',
				text: 'Cosmetics are older than written history. Ground ochre pigments show up in burial sites tens of thousands of years old, and by the time of the Egyptians, makeup was an organized craft with dedicated vessels, recipes and professional standards. What did not exist, for almost all of that history, was any idea of testing whether the products were safe.',
			},
			{ type: 'h2', text: 'The ancient world' },
			{
				type: 'p',
				text: 'Egyptian kohl, the black eye paint seen in every pharaoh portrait, was typically made from galena, a lead ore. Romans lightened their faces with ceruse, a white lead paste, and that habit persisted through Elizabethan England. Lead absorbed through the skin causes hair loss, scarring and neurological damage, which contemporaries noticed and mostly attributed to other causes. The pattern repeats for centuries: the ingredient that produced the effect was also the poison.',
			},
			{ type: 'h2', text: 'When it got worse before it got better' },
			{
				type: 'p',
				text: 'The 1800s and early 1900s industrialized the problem. Victorian pharmacies sold arsenic wafers for a pale complexion. In the 1920s and 30s, radium appeared in face creams marketed as energizing. The breaking point in the United States came in 1933, when an aniline dye eyelash tint called Lash Lure blinded more than a dozen women and killed one. At the time, no federal law let anyone remove it from sale.',
			},
			{
				type: 'p',
				text: 'That case helped push through the Food, Drug, and Cosmetic Act of 1938, the first US law giving the FDA authority over cosmetics. Modern rules have tightened since, most recently with the 2022 MoCRA update, which added mandatory facility registration and adverse-event reporting.',
			},
			{ type: 'h2', text: 'What six thousand years teaches' },
			{
				type: 'ul',
				items: [
					'Natural was never the same thing as safe. Lead, arsenic and radium are all natural.',
					'Marketing has outrun evidence in every era. The claims changed, the pattern did not.',
					'Safety came from testing and regulation, not from tradition or price.',
					'The consumer skills that matter now are reading an ingredient list and patch testing, not trusting a story.',
				],
			},
			{ type: 'h2', text: 'Where that leaves a modern routine' },
			{
				type: 'p',
				text: 'Today’s cosmetics are the safest in history, and the lesson still applies at the margins: unregulated products, imported skin lighteners and viral remedies are where the old pattern survives. If a product promises a dramatic change, the honest version of that promise usually lives in a clinical setting, where the ingredient, the dose and the person applying it are all accountable.',
			},
		],
		related: [
			{ href: '/skin-revitalization', label: 'Skin revitalization' },
			{ href: '/laser-services', label: 'Laser treatments' },
			{ href: '/about', label: 'About Sarah Hitchcox, RN' },
		],
	},
	{
		slug: 'how-to-read-a-skincare-label',
		title: 'How to Read a Skincare Label',
		description:
			'Ingredient order, the 1% line, what "fragrance" hides, and which marketing claims have no legal definition at all.',
		summary:
			'The claims on the front of the box are unregulated. The list on the back follows rules.',
		published: '2026-08-03',
		image: '/img/blog/label.jpg',
		imageAlt: 'A plain unbranded cosmetic bottle in soft daylight',
		sections: [
			{
				type: 'p',
				text: 'Learning to read an ingredient list is the cheapest skill in skincare. It costs nothing and it makes most marketing irrelevant.',
			},
			{ type: 'h2', text: 'Order tells you the story' },
			{
				type: 'p',
				text: 'Ingredients appear in descending order of concentration down to about the one percent mark, after which order is at the manufacturer’s discretion. The first five entries are effectively what you are buying. If the active ingredient on the front of the bottle sits near the bottom of the list, you are paying for a trace of it.',
			},
			{ type: 'h2', text: 'Words that mean nothing' },
			{
				type: 'ul',
				items: [
					'Clean, natural and chemical-free have no agreed legal definition in cosmetics.',
					'Dermatologically tested means some testing happened, not what the result was.',
					'Hypoallergenic means formulated to reduce risk. It is not certified and not a guarantee.',
					'Fragrance or parfum can stand in for dozens of substances that need not be listed separately.',
				],
			},
			{ type: 'h2', text: 'Two habits worth more than any label' },
			{
				type: 'p',
				text: 'Patch test on the inner forearm for a day or two before a product goes on your face, and introduce one new product at a time with about a week between them. Starting three at once guarantees you will never know which one caused a reaction.',
			},
		],
		related: [
			{ href: '/skin-revitalization', label: 'Skin revitalization' },
			{ href: '/about', label: 'About Sarah Hitchcox, RN' },
		],
	},
	{
		// xceleratedweightloss.com (a domain we own) 301s its homepage here.
		// Three fda.gov public notifications link that domain, so this article
		// must always cover the flagged products those notices describe.
		slug: 'xcelerated-weight-loss-fda-warning',
		title: 'Warning: Xcelerated Weight Loss Was Flagged by the FDA',
		description:
			'The FDA told consumers not to buy Xcelerated Weight Loss products after lab tests found hidden drug ingredients. What was in them, and what safe weight loss looks like.',
		summary:
			'If you came here looking for the diet pill once sold at xceleratedweightloss.com, read this first.',
		published: '2026-08-04',
		image: '/img/blog/spilled-pills.jpg',
		imageAlt: 'Loose unmarked capsules spilled from a supplement bottle',
		sections: [
			{
				type: 'note',
				text: 'Why you were redirected: if you arrived here from xceleratedweightloss.com, that domain once belonged to the company that sold these flagged products. We now own it and point it at this consumer notice, so anyone looking up the product finds the FDA warning instead of a sales page.',
			},
			{
				type: 'p',
				text: 'The Xcelerated Weight Loss products are gone, and the company that sold them is gone. They left behind three separate FDA public health notifications. If you owned a bottle, or you are researching a similar product, here is what happened and what to do.',
			},
			{ type: 'h2', text: 'What the FDA found' },
			{
				type: 'p',
				text: 'On July 22, 2016, the U.S. Food and Drug Administration told consumers not to purchase or use Xcelerated Weight Loss "Charged Up" after laboratory analysis found it contained sibutramine that was not declared anywhere on the label. The FDA issued separate public notifications for the "Turbo Charge" and "Ultra Max" versions after lab analysis found hidden drug ingredients in those too.',
			},
			{
				type: 'p',
				text: 'Sibutramine is an appetite suppressant that was sold as the prescription drug Meridia until October 2010, when it was withdrawn from the U.S. market because it raised blood pressure and pulse and was linked to higher risk of heart attack and stroke. A person buying these capsules had no way to know they were taking a withdrawn prescription drug. It can also interact dangerously with common antidepressants and migraine medications.',
			},
			{ type: 'h2', text: 'If you took one of these products' },
			{
				type: 'ul',
				items: [
					'Stop taking it, and keep the bottle in case a clinician wants to see it.',
					'If you have chest pain, a racing heart, severe headache or shortness of breath, seek care now.',
					'Tell your doctor what you took, even if you feel fine. Interactions can be silent.',
					"Report harm from any supplement to the FDA's MedWatch program.",
				],
			},
			{ type: 'h2', text: 'How to spot a spiked supplement' },
			{
				type: 'p',
				text: 'These products were not a one-off. The FDA maintains a whole database of weight-loss supplements found to contain hidden drugs: sibutramine, banned laxatives, even withdrawn heart medications. The pattern repeats: a proprietary blend that names no doses, dramatic promises, and no accountable prescriber anywhere in sight. If a pill produces prescription-strength results without a prescription, the most likely explanation is that it contains a prescription drug.',
			},
			{ type: 'h2', text: 'What safe weight loss actually looks like' },
			{
				type: 'p',
				text: 'The irony of hidden-drug diet pills is that legitimate, effective medication exists. GLP-1 medications such as semaglutide (Wegovy, Ozempic) and tirzepatide (Zepbound, Mounjaro) are FDA-approved, prescribed at a known dose, and monitored by a clinician who knows your history and your other medications. Every one of those safeguards is exactly what a spiked supplement takes away. The same caution applies to "generic" GLP-1 vials from unregulated websites: an unlabeled vial from an anonymous seller has the same problem as an unlabeled capsule.',
			},
			{
				type: 'p',
				text: 'Nothing on this page is medical advice. It is a consumer notice about specific flagged products and general guidance about supplement safety, reviewed by a registered nurse.',
			},
		],
		related: [
			{ href: '/semaglutide', label: 'Medically supervised semaglutide' },
			{ href: '/tirzepatide', label: 'Medically supervised tirzepatide' },
			{ href: '/about', label: 'About Sarah Hitchcox, RN' },
		],
	},
]

export function getPost(slug: string) {
	return blogPosts.find(p => p.slug === slug)
}
