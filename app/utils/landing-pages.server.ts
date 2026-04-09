import fs from 'node:fs/promises'
import path from 'node:path'

import { DEFAULT_BLVD_BOOKING_URL } from '#app/utils/blvd.ts'
import { formatAddress, locations } from '#app/utils/locations.ts'

const BOOKING_URL = DEFAULT_BLVD_BOOKING_URL
const CALL_LABEL = '(865) 426-1826'
const CALL_URL = 'tel:8654261826'
const EMAIL = 'sarah@hitchcoxaesthetics.com'

type WeightLossServiceSlug =
	| 'semaglutide'
	| 'tirzepatide'
	| 'medical-weight-loss-telehealth'

type WeightLossLandingPageConfig = {
	alternateHref: string
	alternateLabel: string
	benefits: Array<{ description: string; title: string }>
	comparisonCopy: string
	comparisonStats: string[]
	faqs: Array<{ answer: string; question: string }>
	heroBadge: string
	heroHeadline: string
	heroImageAlt: string
	heroImageSrc: string
	heroSummary: string
	metaDescription: string
	outcomeLabel: string
	pageTitle: string
	pricingCards: Array<{ detail: string; price: string; title: string }>
	processSteps: Array<{ detail: string; title: string }>
	proofLabel: string
	resultsIntro: string
	serviceLabel: string
	slug: WeightLossServiceSlug
	startingPriceLabel: string
	subheadline: string
	twoUpImages: Array<{ after: string; before: string; label: string }>
	isVirtual?: boolean
}

const weightLossLandingPages: Record<
	WeightLossServiceSlug,
	WeightLossLandingPageConfig
> = {
	semaglutide: {
		alternateHref: '/lp/weight-loss-tirzepatide',
		alternateLabel: 'See tirzepatide options',
		benefits: [
			{
				title: 'Appetite control that feels sustainable',
				description:
					'Semaglutide helps you feel full sooner, stay satisfied longer, and reduce the constant food noise that makes weight loss hard to maintain.',
			},
			{
				title: 'Weekly dosing with medical supervision',
				description:
					'Your plan is monitored and adjusted over time so you can move at the right pace, manage side effects, and keep momentum.',
			},
			{
				title: 'A lower-cost path into GLP-1 care',
				description:
					'Semaglutide starts at $150 per month, giving many Knoxville patients an accessible entry point into medically guided weight loss.',
			},
		],
		comparisonCopy:
			'Semaglutide is a strong fit for patients who want a proven GLP-1 option with weekly dosing, meaningful appetite support, and a more budget-friendly monthly starting point.',
		comparisonStats: [
			'Starts at $150/month',
			'GLP-1 receptor agonist',
			'Up to 15% average weight loss in clinical trials',
		],
		faqs: [
			{
				question: 'How does semaglutide work?',
				answer:
					'Semaglutide mimics a natural hormone that helps regulate appetite. It can help you feel fuller faster, stay full longer, and make calorie reduction feel more manageable.',
			},
			{
				question: 'How much weight can I expect to lose?',
				answer:
					'Individual results vary, but clinical trials showed many patients losing around 15% of body weight when semaglutide was paired with lifestyle changes.',
			},
			{
				question: 'What happens at the consultation?',
				answer:
					'We review your health history, weight-loss goals, and whether semaglutide is the right fit. If you are a candidate, we outline a personalized plan and next steps.',
			},
		],
		heroBadge: 'Medically supervised GLP-1 care in Knoxville',
		heroHeadline: 'Free Semaglutide Consultation',
		heroImageAlt: 'Sarah Hitchcox Aesthetics Knoxville Med Spa',
		heroImageSrc: '/img/sarah.jpg',
		heroSummary:
			'Semaglutide can help reduce cravings, improve portion control, and create steady progress without relying on willpower alone.',
		metaDescription:
			'Semaglutide starting at $150/month. Medically supervised GLP-1 weight loss in Knoxville with a free consultation at Sarah Hitchcox Aesthetics.',
		outcomeLabel: 'Up to 15% average weight loss in clinical trials',
		pageTitle:
			'Medical Weight Loss $150/mo | Knoxville | Sarah Hitchcox Aesthetics',
		pricingCards: [
			{
				title: 'Free consultation',
				price: '$0',
				detail:
					'Review your goals, medical history, candidacy, and the best medication path for your body and budget.',
			},
			{
				title: 'Semaglutide program',
				price: 'Starting at $150/month',
				detail:
					'Includes personalized dosing guidance, progress monitoring, and medically supervised treatment adjustments.',
			},
			{
				title: 'Lipo/B12 support',
				price: '$25/shot',
				detail:
					'Optional wellness support that many patients add for energy and routine consistency alongside their plan.',
			},
		],
		processSteps: [
			{
				title: 'Meet with Sarah',
				detail:
					'Start with a no-pressure consultation focused on your health background, timeline, and weight-loss goals.',
			},
			{
				title: 'Build your plan',
				detail:
					'If semaglutide is appropriate, you receive a dosing approach designed around safe progress and realistic adherence.',
			},
			{
				title: 'Check in consistently',
				detail:
					'Progress is tracked over time so your plan can evolve with your response, schedule, and side-effect tolerance.',
			},
			{
				title: 'Maintain momentum',
				detail:
					'Our goal is not a crash cycle. It is sustainable weight loss with structure, support, and a strategy you can stay on.',
			},
		],
		proofLabel:
			'Trusted by Knoxville clients seeking a practical GLP-1 starting point',
		resultsIntro:
			'Real weight-loss journeys look different from person to person. These images represent the kind of steady, supervised progress our patients work toward over time.',
		serviceLabel: 'Semaglutide',
		slug: 'semaglutide',
		startingPriceLabel: 'Starting at $150/month',
		subheadline:
			'Semaglutide at about half the brand-name price with weekly dosing, medical oversight, and a free consultation to help you decide if GLP-1 treatment is right for you.',
		twoUpImages: [
			{
				label: 'Patient progress example',
				before: '/img/before-after/semaglutide-001-before.webp',
				after: '/img/before-after/semaglutide-001-after.webp',
			},
			{
				label: 'Additional transformation',
				before: '/img/before-after/semaglutide-002-before.webp',
				after: '/img/before-after/semaglutide-002-after.webp',
			},
		],
	},
	tirzepatide: {
		alternateHref: '/lp/weight-loss-semaglutide',
		alternateLabel: 'Compare semaglutide instead',
		benefits: [
			{
				title: 'Dual-action GLP-1 and GIP support',
				description:
					'Tirzepatide acts on two hormone pathways, making it a strong option for patients who want aggressive, clinically proven weight-loss support.',
			},
			{
				title: 'Designed for larger weight-loss potential',
				description:
					'Clinical studies showed average weight loss ranging well beyond many traditional plans when tirzepatide was used consistently and appropriately.',
			},
			{
				title: 'Structured and medically monitored',
				description:
					'We help you start low, adjust gradually, and stay consistent so the treatment supports both safety and long-term progress.',
			},
		],
		comparisonCopy:
			'Tirzepatide is often chosen by patients who want a higher-powered medication strategy and are comfortable investing more each month for a dual-action approach.',
		comparisonStats: [
			'Starts at $250/month',
			'Dual-action GIP and GLP-1',
			'Up to 22% body weight reduction in clinical trials',
		],
		faqs: [
			{
				question: 'How is tirzepatide different from semaglutide?',
				answer:
					'Tirzepatide targets both GIP and GLP-1 receptors, while semaglutide targets GLP-1 alone. That dual action may create stronger results for some patients.',
			},
			{
				question: 'How much weight can tirzepatide help me lose?',
				answer:
					'Clinical trials showed average weight loss ranging from roughly 15% to 22% at higher doses, though every patient responds differently.',
			},
			{
				question: 'What side effects should I expect?',
				answer:
					'The most common side effects are nausea, appetite changes, and digestive upset. A gradual ramp-up and regular monitoring help make the program more tolerable.',
			},
		],
		heroBadge: 'Advanced dual-action weight loss support in Knoxville',
		heroHeadline: 'Free Tirzepatide Consultation',
		heroImageAlt: 'Sarah Hitchcox Aesthetics Med Spa',
		heroImageSrc: '/img/sarah.jpg',
		heroSummary:
			'Tirzepatide combines GIP and GLP-1 support to reduce appetite, improve metabolic response, and help qualified patients pursue more substantial weight loss.',
		metaDescription:
			'Tirzepatide starting at $250/month. Dual-action medically supervised weight loss in Knoxville with a free consultation at Sarah Hitchcox Aesthetics.',
		outcomeLabel: 'Up to 22% body weight reduction in clinical trials',
		pageTitle: 'Tirzepatide $250/mo | Knoxville | Sarah Hitchcox Aesthetics',
		pricingCards: [
			{
				title: 'Free consultation',
				price: '$0',
				detail:
					'We review your goals, history, medication options, and whether tirzepatide is the right fit for your timeline.',
			},
			{
				title: 'Tirzepatide program',
				price: 'Starting at $250/month',
				detail:
					'Includes medically supervised treatment planning, structured check-ins, and gradual dose progression based on tolerance.',
			},
			{
				title: 'Lipo/B12 support',
				price: '$25/shot',
				detail:
					'Optional add-on support for patients who want an easy wellness touchpoint while staying engaged with their plan.',
			},
		],
		processSteps: [
			{
				title: 'Review your candidacy',
				detail:
					'We start with your health history, goals, previous weight-loss attempts, and what kind of support you need to stay consistent.',
			},
			{
				title: 'Start with a monitored protocol',
				detail:
					'Tirzepatide dosing is introduced carefully so your body has time to adjust while we protect your momentum and comfort.',
			},
			{
				title: 'Track results and tolerance',
				detail:
					'We monitor response, side effects, and progress so your plan stays realistic, sustainable, and medically responsible.',
			},
			{
				title: 'Adjust for long-term success',
				detail:
					'The goal is meaningful weight loss plus a plan you can continue with confidence rather than a short burst that fades out.',
			},
		],
		proofLabel:
			'Chosen by Knoxville patients looking for a stronger dual-action option',
		resultsIntro:
			'Tirzepatide is often selected by patients who want a more aggressive medication strategy. These results illustrate the kind of gradual, supervised transformation we aim for.',
		serviceLabel: 'Tirzepatide',
		slug: 'tirzepatide',
		startingPriceLabel: 'Starting at $250/month',
		subheadline:
			'Tirzepatide offers dual-action GIP and GLP-1 support with medically guided dosing, consistent follow-up, and a free consultation to see whether it matches your goals.',
		twoUpImages: [
			{
				label: 'Patient progress example',
				before: '/img/before-after/semaglutide-001-before.webp',
				after: '/img/before-after/semaglutide-001-after.webp',
			},
			{
				label: 'Additional transformation',
				before: '/img/before-after/semaglutide-002-before.webp',
				after: '/img/before-after/semaglutide-002-after.webp',
			},
		],
	},
	'medical-weight-loss-telehealth': {
		alternateHref: '/lp/semaglutide',
		alternateLabel: 'Compare in-person options',
		benefits: [
			{
				title: 'Convenient care from anywhere in TN',
				description:
					'Complete your consultation, follow-ups, and program management entirely over the phone or video call. No office visits required.',
			},
			{
				title: 'Medication shipped directly to your door',
				description:
					'Once approved, your GLP-1 or GIP/GLP-1 medication (Semaglutide or Tirzepatide) and all necessary supplies are shipped directly to your home in Tennessee.',
			},
			{
				title: 'Same expert medical supervision',
				description:
					'You get the exact same level of care, personalized dosing, and ongoing support from Sarah Hitchcox Aesthetics, just in a more convenient virtual format.',
			},
		],
		comparisonCopy:
			'Our telehealth program is perfect for patients across Tennessee who want the proven benefits of our medical weight-loss program without the commute. You receive the same medications, the same pricing, and the same dedicated support.',
		comparisonStats: [
			'Starts at $150/month',
			'100% Virtual Consultations & Follow-ups',
			'Medication shipped directly to you anywhere in TN',
		],
		faqs: [
			{
				question: 'How does the telehealth process work?',
				answer:
					'You book a virtual consultation, we discuss your health history and goals over the phone or via video, and if approved, your medication is prescribed and shipped directly to your door.',
			},
			{
				question: 'Where can you ship the medication?',
				answer:
					'We can ship weight-loss medications anywhere within the state of Tennessee.',
			},
			{
				question: 'Is the pricing different for telehealth?',
				answer:
					'No. You get the exact same competitive pricing as our in-office patients. Semaglutide programs start at $150/month and Tirzepatide starts at $250/month.',
			},
		],
		heroBadge: 'Medical Weight Loss (Telehealth) in Tennessee',
		heroHeadline: 'Free Medical Weight Loss (Telehealth) Consultation',
		heroImageAlt: 'Sarah Hitchcox Aesthetics Medical Weight Loss Telehealth',
		heroImageSrc: '/img/sarah.jpg',
		heroSummary:
			'Get expert medical weight-loss support, GLP-1 medications, and dedicated check-ins from the comfort of your home, shipped anywhere in TN.',
		metaDescription:
			'Telehealth medical weight loss in Tennessee. Semaglutide starts at $150/mo and Tirzepatide at $250/mo. Medications shipped to your door. Book a free virtual consultation.',
		outcomeLabel: 'Shipped to your door anywhere in TN',
		pageTitle:
			'Medical Weight Loss (Telehealth) | Tennessee | Sarah Hitchcox Aesthetics',
		pricingCards: [
			{
				title: 'Free virtual consultation',
				price: '$0',
				detail:
					'Review your goals, medical history, and candidacy from anywhere in Tennessee.',
			},
			{
				title: 'Semaglutide program',
				price: 'Starting at $150/month',
				detail:
					'Includes your medication, shipped supplies, and virtual medical oversight.',
			},
			{
				title: 'Tirzepatide program',
				price: 'Starting at $250/month',
				detail:
					'Our dual-action GLP-1/GIP option, including medication shipped to you and ongoing virtual support.',
			},
		],
		processSteps: [
			{
				title: 'Book a virtual consult',
				detail:
					'Schedule a time that works for you. We will discuss your health background and weight-loss goals over the phone or video.',
			},
			{
				title: 'Get your custom plan',
				detail:
					'If you are a candidate, we will build a dosing approach and prescribe the medication that best fits your needs.',
			},
			{
				title: 'Receive your medication',
				detail:
					'Your medication and all necessary supplies are shipped directly to your home address in Tennessee.',
			},
			{
				title: 'Check in virtually',
				detail:
					'We track your progress and adjust your dosing over time through convenient virtual check-ins.',
			},
		],
		proofLabel:
			'Trusted by patients across Tennessee for convenient, expert care',
		resultsIntro:
			'Our virtual patients achieve the same incredible, steady progress as our in-office patients, all with the convenience of at-home care.',
		serviceLabel: 'Medical Weight Loss (Telehealth)',
		slug: 'medical-weight-loss-telehealth',
		startingPriceLabel: 'Starting at $150/month',
		subheadline:
			'Expert medical weight loss with Semaglutide or Tirzepatide, managed 100% virtually. Get your medication shipped directly to you anywhere in Tennessee.',
		twoUpImages: [
			{
				label: 'Patient progress example',
				before: '/img/before-after/semaglutide-001-before.webp',
				after: '/img/before-after/semaglutide-001-after.webp',
			},
			{
				label: 'Additional transformation',
				before: '/img/before-after/semaglutide-002-before.webp',
				after: '/img/before-after/semaglutide-002-after.webp',
			},
		],
		isVirtual: true,
	},
}

function isWeightLossServiceSlug(slug: string): slug is WeightLossServiceSlug {
	return (
		slug === 'semaglutide' ||
		slug === 'tirzepatide' ||
		slug === 'medical-weight-loss-telehealth'
	)
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function escapeHtml(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;')
}

function renderLocations() {
	return locations
		.map(
			location => `
				<div class="location-card">
					<div class="location-label">${escapeHtml(location.displayName)}</div>
					<h3>${escapeHtml(location.name)}</h3>
					<p>${escapeHtml(formatAddress(location))}</p>
					<div class="location-links">
						<a href="${location.googleMapsDirectionsUrl}" target="_blank" rel="noopener">Get directions</a>
						<a href="${BOOKING_URL}" target="_blank" rel="noopener">Book this location</a>
					</div>
				</div>
			`,
		)
		.join('')
}

function buildWeightLossLandingPageHtml(config: WeightLossLandingPageConfig) {
	const benefitsHtml = config.benefits
		.map(
			benefit => `
				<div class="info-card">
					<h3>${escapeHtml(benefit.title)}</h3>
					<p>${escapeHtml(benefit.description)}</p>
				</div>
			`,
		)
		.join('')

	const pricingCardsHtml = config.pricingCards
		.map(
			card => `
				<div class="pricing-card">
					<div class="pricing-label">${escapeHtml(card.title)}</div>
					<div class="pricing-amount">${escapeHtml(card.price)}</div>
					<p>${escapeHtml(card.detail)}</p>
					<a href="${BOOKING_URL}" target="_blank" rel="noopener">Book now</a>
				</div>
			`,
		)
		.join('')

	const processHtml = config.processSteps
		.map(
			(step, index) => `
				<div class="step-card">
					<div class="step-index">0${index + 1}</div>
					<h3>${escapeHtml(step.title)}</h3>
					<p>${escapeHtml(step.detail)}</p>
				</div>
			`,
		)
		.join('')

	const resultsHtml = config.twoUpImages
		.map(
			item => `
				<div class="result-card">
					<div class="result-pair">
						<figure>
							<img src="${item.before}" alt="${escapeHtml(item.label)} before" loading="lazy" />
							<figcaption>Before</figcaption>
						</figure>
						<figure>
							<img src="${item.after}" alt="${escapeHtml(item.label)} after" loading="lazy" />
							<figcaption>After</figcaption>
						</figure>
					</div>
					<p>${escapeHtml(item.label)}</p>
				</div>
			`,
		)
		.join('')

	const faqHtml = config.faqs
		.map(
			item => `
				<details class="faq-item">
					<summary>${escapeHtml(item.question)}</summary>
					<p>${escapeHtml(item.answer)}</p>
				</details>
			`,
		)
		.join('')

	const comparisonStatsHtml = config.comparisonStats
		.map(stat => `<li>${escapeHtml(stat)}</li>`)
		.join('')

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#111827" />
  <title>${escapeHtml(config.pageTitle)}</title>
  <meta name="description" content="${escapeHtml(config.metaDescription)}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />
  <style>
    :root {
      --ink: #101827;
      --ink-soft: #475467;
      --cream: #faf6f1;
      --sand: #efe5d9;
      --stone: #e4ddd4;
      --line: rgba(16, 24, 39, 0.1);
      --accent: #146c43;
      --accent-soft: #e8f5ee;
      --gold: #b68448;
      --white: #ffffff;
      --shadow: 0 24px 80px rgba(16, 24, 39, 0.08);
      --radius-xl: 28px;
      --radius-lg: 20px;
      --radius-md: 14px;
      --max: 1160px;
    }

    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      font-family: 'DM Sans', system-ui, sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(182, 132, 72, 0.18), transparent 28%),
        linear-gradient(180deg, #f8f4ee 0%, #ffffff 28%, #ffffff 100%);
      line-height: 1.6;
      padding-bottom: 92px;
    }
    img { display: block; max-width: 100%; }
    a { color: inherit; text-decoration: none; }
    .container { max-width: var(--max); margin: 0 auto; padding: 0 20px; }

    .header {
      position: sticky;
      top: 0;
      z-index: 20;
      background: rgba(255, 255, 255, 0.92);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--line);
    }
    .header-inner {
      height: 72px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .brand-mark {
      width: 42px;
      height: 42px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: linear-gradient(135deg, #1f2937, #394150);
      color: var(--white);
      font-size: 13px;
    }
    .brand-copy small {
      display: block;
      color: var(--ink-soft);
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .button,
    .button-secondary,
    .button-ghost {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      min-height: 50px;
      padding: 0 20px;
      border-radius: 999px;
      font-weight: 700;
      transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
    }
    .button:hover,
    .button-secondary:hover,
    .button-ghost:hover { transform: translateY(-1px); }
    .button {
      background: var(--ink);
      color: var(--white);
      box-shadow: var(--shadow);
    }
    .button-secondary {
      background: var(--white);
      color: var(--ink);
      border: 1px solid var(--line);
    }
    .button-ghost {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.28);
      color: var(--white);
    }

    .hero {
      padding: 52px 0 28px;
    }
    .hero-shell {
      display: grid;
      gap: 28px;
      grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
      align-items: stretch;
      padding: 24px;
      border-radius: 36px;
      background: rgba(255, 255, 255, 0.82);
      border: 1px solid var(--line);
      box-shadow: var(--shadow);
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .hero h1,
    .section h2,
    .cta-panel h2 {
      margin: 0;
      font-family: 'DM Serif Display', Georgia, serif;
      line-height: 1.05;
      letter-spacing: -0.02em;
    }
    .hero h1 {
      margin-top: 18px;
      font-size: clamp(2.9rem, 6vw, 5.2rem);
    }
    .hero h1 span { color: var(--gold); }
    .hero-copy p {
      margin: 18px 0 0;
      font-size: 18px;
      color: var(--ink-soft);
      max-width: 640px;
    }
    .hero-stats {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin: 22px 0 0;
    }
    .stat-chip {
      padding: 11px 14px;
      border-radius: 999px;
      background: var(--white);
      border: 1px solid var(--line);
      font-size: 14px;
      font-weight: 700;
      color: var(--ink);
    }
    .hero-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      margin-top: 28px;
    }
    .proof {
      margin-top: 18px;
      font-size: 15px;
      color: var(--ink-soft);
    }

    .hero-panel {
      position: relative;
      overflow: hidden;
      border-radius: 28px;
      min-height: 100%;
      background: var(--ink);
      display: grid;
    }
    .hero-panel img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .section {
      padding: 26px 0;
    }
    .section-header {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 18px;
      margin-bottom: 18px;
      flex-wrap: wrap;
    }
    .section-header p {
      margin: 10px 0 0;
      max-width: 700px;
      color: var(--ink-soft);
    }
    .section h2 {
      font-size: clamp(2rem, 4vw, 3.2rem);
    }

    .grid-three,
    .pricing-grid,
    .results-grid,
    .locations-grid,
    .steps-grid {
      display: grid;
      gap: 18px;
    }
    .grid-three,
    .pricing-grid,
    .locations-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .results-grid,
    .steps-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }

    .info-card,
    .pricing-card,
    .result-card,
    .location-card,
    .step-card,
    .compare-card,
    .faq-wrap,
    .cta-panel {
      border-radius: var(--radius-xl);
      background: var(--white);
      border: 1px solid var(--line);
      box-shadow: var(--shadow);
    }
    .info-card,
    .pricing-card,
    .location-card,
    .step-card,
    .compare-card,
    .faq-wrap,
    .cta-panel {
      padding: 24px;
    }
    .info-card h3,
    .pricing-card .pricing-label,
    .location-card h3,
    .step-card h3 {
      margin: 0;
      font-size: 1.1rem;
    }
    .info-card p,
    .pricing-card p,
    .location-card p,
    .step-card p,
    .compare-card p,
    .faq-item p,
    .cta-panel p {
      margin: 12px 0 0;
      color: var(--ink-soft);
    }

    .pricing-amount {
      margin-top: 14px;
      font-family: 'DM Serif Display', Georgia, serif;
      font-size: 2rem;
      color: var(--gold);
    }
    .pricing-card a,
    .location-links a,
    .compare-link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-top: 18px;
      color: var(--ink);
      font-weight: 700;
    }

    .result-card { overflow: hidden; }
    .result-pair {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      padding: 12px;
      background: var(--cream);
    }
    .result-pair figure {
      margin: 0;
      overflow: hidden;
      border-radius: 18px;
      background: var(--white);
      border: 1px solid var(--line);
    }
    .result-pair img {
      width: 100%;
      aspect-ratio: 4 / 5;
      object-fit: cover;
    }
    .result-pair figcaption {
      padding: 10px 12px 12px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--ink-soft);
    }
    .result-card p {
      padding: 0 18px 18px;
      margin: 14px 0 0;
      font-size: 14px;
      color: var(--ink-soft);
    }

    .compare-card {
      display: grid;
      gap: 20px;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: start;
      background: linear-gradient(135deg, rgba(20, 108, 67, 0.06), rgba(255, 255, 255, 1));
    }
    .compare-card ul {
      margin: 14px 0 0;
      padding-left: 18px;
      color: var(--ink-soft);
    }
    .compare-card li + li { margin-top: 8px; }

    .step-index {
      display: inline-grid;
      place-items: center;
      width: 42px;
      height: 42px;
      border-radius: 50%;
      background: var(--accent-soft);
      color: var(--accent);
      font-weight: 700;
      margin-bottom: 16px;
    }

    .faq-wrap { display: grid; gap: 14px; }
    .faq-item {
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 18px 20px;
      background: #fcfcfc;
    }
    .faq-item summary {
      cursor: pointer;
      font-weight: 700;
      list-style: none;
    }
    .faq-item summary::-webkit-details-marker { display: none; }

    .location-label {
      display: inline-flex;
      padding: 7px 11px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .location-links {
      display: flex;
      gap: 14px;
      flex-wrap: wrap;
    }

    .cta-panel {
      background: linear-gradient(135deg, #101827, #1d2939);
      color: var(--white);
    }
    .cta-panel p { color: rgba(255, 255, 255, 0.78); }
    .cta-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      margin-top: 24px;
    }

    .footer {
      padding: 22px 0 28px;
      color: var(--ink-soft);
      font-size: 14px;
    }
    .footer a { font-weight: 700; }

    @media (max-width: 980px) {
      .hero-shell,
      .compare-card,
      .grid-three,
      .pricing-grid,
      .results-grid,
      .locations-grid,
      .steps-grid {
        grid-template-columns: 1fr;
      }
      .hero-panel { min-height: 520px; }
    }

    @media (max-width: 720px) {
      body { padding-bottom: 108px; }
      .header-inner { height: auto; padding: 14px 0; align-items: flex-start; }
      .header-actions { width: 100%; justify-content: stretch; }
      .header-actions a { flex: 1; }
      .hero { padding-top: 26px; }
      .hero-shell { padding: 16px; border-radius: 28px; }
      .hero-panel { min-height: 420px; }
      .section { padding: 22px 0; }
      .result-pair { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header class="header">
    <div class="container header-inner">
      <a href="/" class="brand" aria-label="Sarah Hitchcox Aesthetics">
        <div class="brand-mark">SH</div>
        <div class="brand-copy">
          Sarah Hitchcox
          <small>Aesthetics</small>
        </div>
      </a>
      <div class="header-actions">
        <a href="${CALL_URL}" class="button-secondary">${CALL_LABEL}</a>
        <a href="${BOOKING_URL}" class="button" target="_blank" rel="noopener">Schedule now</a>
      </div>
    </div>
  </header>

  <main>
    <section class="hero">
      <div class="container hero-shell">
        <div class="hero-copy">
          <div class="eyebrow">${escapeHtml(config.heroBadge)}</div>
          <h1>Free <span>${escapeHtml(config.serviceLabel)}</span> Consultation</h1>
          <p>${escapeHtml(config.subheadline)}</p>
          <div class="hero-stats">
            <div class="stat-chip">${escapeHtml(config.startingPriceLabel)}</div>
            <div class="stat-chip">${escapeHtml(config.outcomeLabel)}</div>
            <div class="stat-chip">Weekly injection plan</div>
          </div>
          <div class="hero-actions">
            <a href="${BOOKING_URL}" class="button" target="_blank" rel="noopener">Book your appointment</a>
            <a href="${CALL_URL}" class="button-secondary">Call ${CALL_LABEL}</a>
          </div>
          <div class="proof">${escapeHtml(config.proofLabel)}</div>
        </div>

        <div class="hero-panel">
          <img src="${config.heroImageSrc}" alt="${escapeHtml(config.heroImageAlt)}" />
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-header">
          <div>
            <h2>Why Knoxville patients choose ${escapeHtml(config.serviceLabel.toLowerCase())}</h2>
            <p>${escapeHtml(config.comparisonCopy)}</p>
          </div>
        </div>
        <div class="grid-three">${benefitsHtml}</div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-header">
          <div>
            <h2>Simple pricing and a clear starting point</h2>
            <p>You do not need to guess what the first step looks like. Start with a free consultation, then choose the medication path that matches your goals and budget.</p>
          </div>
        </div>
        <div class="pricing-grid">${pricingCardsHtml}</div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-header">
          <div>
            <h2>Weight-loss progress worth committing to</h2>
            <p>${escapeHtml(config.resultsIntro)}</p>
          </div>
        </div>
        <div class="results-grid">${resultsHtml}</div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="compare-card">
          <div>
            <h2>${escapeHtml(config.serviceLabel)} at a glance</h2>
            <p>${escapeHtml(config.comparisonCopy)}</p>
            <ul>${comparisonStatsHtml}</ul>
          </div>
          <div>
            <a href="${escapeHtml(config.alternateHref)}" class="compare-link">${escapeHtml(config.alternateLabel)}</a>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-header">
          <div>
            <h2>What the process looks like</h2>
            <p>Every program starts with a consultation and moves forward with structure, accountability, and medical oversight.</p>
          </div>
        </div>
        <div class="steps-grid">${processHtml}</div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-header">
          <div>
            <h2>Common questions before you start</h2>
            <p>If you are comparing medications or wondering what the first appointment looks like, these are the questions we hear most often.</p>
          </div>
        </div>
		<div class="faq-wrap">${faqHtml}</div>
      </div>
    </section>

	${
		config.isVirtual
			? ''
			: `
    <section class="section">
      <div class="container">
        <div class="section-header">
          <div>
            <h2>Choose the Knoxville-area location that works best</h2>
            <p>Book at either Sarah Hitchcox Aesthetics location and start with a free consultation built around your weight-loss goals.</p>
          </div>
        </div>
        <div class="locations-grid">${renderLocations()}</div>
      </div>
    </section>
`
	}

    <section class="section">
      <div class="container">
        <div class="cta-panel">
          <h2>Ready to see if ${escapeHtml(config.serviceLabel.toLowerCase())} is right for you?</h2>
          <p>Start with a free consultation, get honest guidance, and leave with a plan that fits your goals, timeline, and budget.</p>
          <div class="cta-actions">
            <a href="${BOOKING_URL}" class="button" target="_blank" rel="noopener">Book your free consultation</a>
            <a href="${CALL_URL}" class="button-ghost">Call ${CALL_LABEL}</a>
          </div>
        </div>
      </div>
    </section>
  </main>

  <footer class="footer">
    <div class="container">
      <div>Sarah Hitchcox Aesthetics - Knoxville and Farragut, TN</div>
      <div><a href="${CALL_URL}">${CALL_LABEL}</a> - <a href="mailto:${EMAIL}">${EMAIL}</a></div>
    </div>
  </footer>
</body>
</html>`
}

export async function loadStaticLandingPage(options: {
	relativeHtmlPath: string
	serviceSlug: string
}) {
	const htmlPath = path.join(process.cwd(), options.relativeHtmlPath)

	try {
		return await fs.readFile(htmlPath, 'utf8')
	} catch (error) {
		if (
			isMissingFileError(error) &&
			isWeightLossServiceSlug(options.serviceSlug)
		) {
			return buildWeightLossLandingPageHtml(
				weightLossLandingPages[options.serviceSlug],
			)
		}

		throw error
	}
}
