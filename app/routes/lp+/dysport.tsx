import { json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { useBlvdHtml } from '#app/utils/blvd-context.tsx'
import { DEFAULT_BLVD_BOOKING_URL } from '#app/utils/blvd.ts'
import { getEnv } from '#app/utils/env.server.ts'

export async function loader() {
	return json({ html, ENV: getEnv() })
}

export default function LandingPage() {
	const { html, ENV } = useLoaderData<typeof loader>()
	const injectedHtml = useBlvdHtml(
		html.replace('G-XTX2CN9CP7', ENV.GA_MEASUREMENT_ID || 'G-XTX2CN9CP7'),
	)
	return (
		<iframe
			srcDoc={injectedHtml}
			title="Landing Page"
			style={{
				width: '100vw',
				height: '100dvh',
				border: 'none',
				margin: 0,
				padding: 0,
				display: 'block',
				position: 'absolute',
				top: 0,
				left: 0,
				zIndex: 9999,
			}}
		/>
	)
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#020817">
    <title>20% Off Dysport — Knoxville | Sarah Hitchcox Aesthetics</title>
    <meta name="description" content="20% off your first Dysport treatment. Smooth, airbrushed results in as little as 2 days. Perfect 5.0 Google rating with 217+ reviews. RN-administered in Knoxville, TN. Book your appointment today.">

    

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet">

    <style>
        /* ============================================
           SARAH HITCHCOX AESTHETICS — Version D
           Hybrid B + C Landing Page
           ============================================ */

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
            --black: #020817;
            --white: #ffffff;
            --cream: #faf8f5;
            --warm-50: #fdfcfb;
            --warm-100: #f5f0eb;
            --warm-200: #e8e0d8;
            --gray-200: #e5e7eb;
            --gray-300: #d1d5db;
            --gray-400: #9ca3af;
            --gray-500: #6b7280;
            --gray-600: #4b5563;
            --gray-700: #374151;
            --gray-800: #1f2937;
            --accent: #16a34a;
            --accent-bg: #ecfdf5;
            --star: #f59e0b;
            --font-body: 'DM Sans', system-ui, -apple-system, sans-serif;
            --font-display: 'DM Serif Display', Georgia, serif;
            --font-serif: 'DM Serif Display', Georgia, serif;
            --max-width: 1100px;
            --radius: 14px;
            --radius-sm: 10px;
        }

        html { scroll-behavior: smooth; -webkit-text-size-adjust: 100%; }

        body {
            font-family: var(--font-body);
            color: var(--black);
            background: var(--white);
            line-height: 1.6;
            -webkit-font-smoothing: antialiased;
            padding-bottom: 72px;
        }

        img { max-width: 100%; height: auto; display: block; }
        a { color: inherit; }
        button { cursor: pointer; font-family: inherit; }

        .container {
            max-width: var(--max-width);
            margin: 0 auto;
            padding: 0 20px;
        }

        /* =============================================
           B-PREFIX STYLES (from v4-b)
           ============================================= */

        /* ---- HEADER (B) ---- */
        .b-header {
            position: sticky;
            top: 0;
            z-index: 100;
            background: var(--white);
            border-bottom: 1px solid var(--gray-200);
            box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }
        .b-header-inner {
            max-width: var(--max-width);
            margin: 0 auto;
            padding: 0 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            height: 62px;
        }
        .b-logo {
            display: flex;
            align-items: center;
            gap: 10px;
            text-decoration: none;
        }
        .b-logo-icon {
            width: 34px;
            height: 34px;
            background: var(--black);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--white);
            font-family: var(--font-display);
            font-size: 15px;
            flex-shrink: 0;
        }
        .b-logo-text {
            font-weight: 500;
            font-size: 14px;
            letter-spacing: 0.04em;
            color: var(--black);
            line-height: 1.2;
        }
        .b-logo-text small {
            display: block;
            font-weight: 400;
            font-size: 11px;
            color: var(--gray-500);
            letter-spacing: 0;
        }
        .b-header-cta {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            background: var(--black);
            color: var(--white);
            font-size: 13px;
            font-weight: 600;
            padding: 10px 20px;
            border-radius: var(--radius-sm);
            text-decoration: none;
            border: none;
            transition: background 0.2s;
        }
        .b-header-cta:hover { background: var(--gray-800); }
        .b-header-cta svg { width: 15px; height: 15px; }

        /* ---- HERO (B) ---- */
        .b-hero {
            padding: 44px 0 52px;
            background: var(--cream);
            border-bottom: 1px solid var(--warm-200);
        }
        .b-hero-grid {
            display: flex;
            flex-direction: column;
            gap: 32px;
        }
        .b-hero-badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: var(--accent-bg);
            color: var(--accent);
            font-size: 13px;
            font-weight: 600;
            padding: 6px 14px;
            border-radius: 20px;
            margin-bottom: 12px;
        }
        .b-hero h1 {
            font-family: var(--font-display);
            font-weight: 400;
            font-size: 36px;
            line-height: 1.15;
            margin-bottom: 6px;
        }
        .b-hero h1 span {
            color: var(--gray-600);
        }
        .b-hero-price {
            font-size: 16px;
            color: var(--gray-600);
            margin-bottom: 20px;
        }
        .b-hero-price strong {
            color: var(--black);
            font-weight: 700;
        }
        .b-hero-rating {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 24px;
            padding: 10px 16px;
            background: var(--white);
            border-radius: var(--radius-sm);
            border: 1px solid var(--warm-200);
            width: fit-content;
        }
        .b-hero-rating-score {
            font-family: var(--font-display);
            font-size: 28px;
            line-height: 1;
        }
        .b-stars { display: flex; gap: 2px; }
        .b-stars svg { width: 16px; height: 16px; fill: var(--star); }
        .b-hero-rating-label {
            font-size: 12px;
            color: var(--gray-500);
        }
        .b-hero-ctas {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .b-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            font-size: 15px;
            font-weight: 600;
            padding: 15px 28px;
            border-radius: var(--radius-sm);
            text-decoration: none;
            transition: all 0.2s;
            border: 2px solid transparent;
            text-align: center;
        }
        .b-btn:active { transform: scale(0.97); }
        .b-btn svg { width: 18px; height: 18px; flex-shrink: 0; }
        .b-btn-dark {
            background: var(--black);
            color: var(--white);
            border-color: var(--black);
        }
        .b-btn-dark:hover { background: var(--gray-800); border-color: var(--gray-800); }
        .b-btn-light {
            background: var(--white);
            color: var(--black);
            border-color: var(--gray-300);
        }
        .b-btn-light:hover { border-color: var(--black); }
        .b-hero-photo {
            width: 100%;
            border-radius: var(--radius);
            overflow: hidden;
            aspect-ratio: 4/3;
            background: var(--warm-100);
            position: relative;
        }
        .b-hero-photo img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: center center;
        }
        .b-hero-photo-badge {
            position: absolute;
            bottom: 16px;
            left: 16px;
            background: var(--accent);
            color: var(--white);
            font-size: 12px;
            font-weight: 700;
            padding: 6px 14px;
            border-radius: 8px;
        }

        /* ---- SOCIAL PROOF BAR (B) ---- */
        .b-proof-bar {
            background: var(--black);
            color: var(--white);
            padding: 14px 0;
            overflow-x: auto;
        }
        .b-proof-inner {
            max-width: var(--max-width);
            margin: 0 auto;
            padding: 0 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 24px;
            min-width: max-content;
        }
        .b-proof-item {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
            font-weight: 500;
            white-space: nowrap;
        }
        .b-proof-item svg { width: 16px; height: 16px; }
        .b-proof-divider {
            width: 1px;
            height: 14px;
            background: rgba(255,255,255,0.2);
        }

        /* ---- BEFORE/AFTER (B) ---- */
        .b-results {
            padding: 56px 0;
            background: var(--cream);
        }
        .b-section-label {
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: var(--gray-400);
            margin-bottom: 8px;
        }
        .b-section-title {
            font-family: var(--font-display);
            font-weight: 400;
            font-size: 30px;
            line-height: 1.2;
            margin-bottom: 8px;
        }
        .b-section-sub {
            font-size: 15px;
            color: var(--gray-500);
            margin-bottom: 32px;
        }
        .b-ba-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 20px;
        }
        .b-ba-pair {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 4px;
            border-radius: var(--radius);
            overflow: hidden;
        }
        .b-ba-img {
            aspect-ratio: 1;
            background: var(--warm-100);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 13px;
            color: var(--gray-400);
            position: relative;
        }
        .b-ba-img img { width: 100%; height: 100%; object-fit: cover; }
        .b-ba-tag {
            position: absolute;
            bottom: 8px;
            left: 8px;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            background: rgba(0,0,0,0.55);
            color: var(--white);
            padding: 3px 8px;
            border-radius: 4px;
        }
        .b-ba-label {
            text-align: center;
            font-size: 13px;
            font-weight: 500;
            color: var(--gray-600);
            margin-top: 8px;
        }
        .b-results-cta {
            text-align: center;
            margin-top: 28px;
        }
        .b-link {
            font-size: 14px;
            font-weight: 600;
            color: var(--black);
            text-decoration: none;
            border-bottom: 1.5px solid var(--black);
            padding-bottom: 2px;
        }
        .b-link:hover { opacity: 0.7; }

        /* ---- PROVIDER (B) ---- */
        .b-provider {
            padding: 48px 0;
            background: var(--cream);
        }
        .b-provider-card {
            display: flex;
            flex-direction: column;
            gap: 24px;
            background: var(--white);
            border: 1px solid var(--warm-200);
            border-radius: var(--radius);
            padding: 24px;
        }
        .b-provider-photo {
            width: 100%;
            aspect-ratio: 3/4;
            border-radius: var(--radius-sm);
            background: var(--warm-100);
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            color: var(--gray-400);
        }
        .b-provider-photo img { width: 100%; height: 100%; object-fit: cover; object-position: center 15%; }
        .b-provider-name {
            font-family: var(--font-display);
            font-size: 24px;
            margin-bottom: 4px;
        }
        .b-provider-cred {
            font-size: 13px;
            color: var(--gray-500);
            margin-bottom: 12px;
        }
        .b-provider-bio {
            font-size: 14px;
            color: var(--gray-600);
            line-height: 1.65;
            margin-bottom: 18px;
        }

        /* ---- LOCATIONS (B) ---- */
        .b-locations {
            padding: 56px 0;
            background: var(--cream);
        }
        .b-loc-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 14px;
            margin-bottom: 24px;
        }
        .b-loc-card {
            background: var(--white);
            border: 1px solid var(--warm-200);
            border-radius: var(--radius);
            padding: 22px;
        }
        .b-loc-name {
            font-size: 16px;
            font-weight: 700;
            margin-bottom: 4px;
        }
        .b-loc-address {
            font-size: 14px;
            color: var(--gray-500);
            line-height: 1.5;
            margin-bottom: 12px;
        }
        .b-loc-actions {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
        }
        .b-loc-link {
            font-size: 13px;
            font-weight: 600;
            color: var(--black);
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
        .b-loc-link:hover { opacity: 0.7; }
        .b-loc-link svg { width: 14px; height: 14px; }
        .b-map {
            width: 100%;
            height: 260px;
            border-radius: var(--radius);
            border: 1px solid var(--warm-200);
            overflow: hidden;
        }
        .b-map iframe { width: 100%; height: 100%; border: none; }

        /* ---- FINAL CTA (B) ---- */
        .b-final {
            padding: 64px 0;
            background: var(--black);
            color: var(--white);
            text-align: center;
        }
        .b-final-stars {
            display: flex;
            justify-content: center;
            gap: 4px;
            margin-bottom: 16px;
        }
        .b-final-stars svg { width: 20px; height: 20px; fill: var(--star); }
        .b-final h2 {
            font-family: var(--font-display);
            font-size: 32px;
            margin-bottom: 8px;
        }
        .b-final p {
            font-size: 15px;
            color: rgba(255,255,255,0.6);
            margin-bottom: 24px;
            max-width: 400px;
            margin-left: auto;
            margin-right: auto;
        }
        .b-final-ctas {
            display: flex;
            gap: 12px;
            justify-content: center;
            flex-wrap: wrap;
        }
        .b-btn-white {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: var(--white);
            color: var(--black);
            font-size: 15px;
            font-weight: 600;
            padding: 14px 28px;
            border-radius: var(--radius-sm);
            text-decoration: none;
            border: 2px solid var(--white);
            transition: all 0.2s;
        }
        .b-btn-white:hover { background: var(--cream); }
        .b-btn-ghost {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: transparent;
            color: var(--white);
            font-size: 15px;
            font-weight: 600;
            padding: 14px 28px;
            border-radius: var(--radius-sm);
            text-decoration: none;
            border: 2px solid rgba(255,255,255,0.25);
            transition: all 0.2s;
        }
        .b-btn-ghost:hover { border-color: var(--white); }

        /* ---- FOOTER (B) ---- */
        .b-footer {
            background: var(--black);
            border-top: 1px solid rgba(255,255,255,0.06);
            padding: 28px 0;
            color: rgba(255,255,255,0.35);
            font-size: 13px;
        }
        .b-footer a {
            color: rgba(255,255,255,0.45);
            text-decoration: none;
        }
        .b-footer a:hover { color: var(--white); }

        /* ---- STICKY BAR (B) ---- */
        .b-sticky {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            z-index: 99;
            background: var(--white);
            border-top: 1px solid var(--gray-200);
            box-shadow: 0 -4px 16px rgba(0,0,0,0.08);
            padding: 10px 16px;
            display: flex;
            gap: 10px;
        }
        .b-sticky a {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 7px;
            padding: 12px;
            border-radius: var(--radius-sm);
            font-size: 14px;
            font-weight: 600;
            text-decoration: none;
        }
        .b-sticky a:active { transform: scale(0.97); }
        .b-sticky a svg { width: 16px; height: 16px; }
        .b-sticky-book { background: var(--black); color: var(--white); }
        .b-sticky-call { background: var(--white); color: var(--black); border: 2px solid var(--gray-300); }

        /* =============================================
           C-PREFIX STYLES (from v4-c)
           ============================================= */

        /* ---- PRICING (C) ---- */
        .c-pricing {
            padding: 72px 0 80px;
        }
        .c-pricing-inner {
            max-width: 900px;
            margin: 0 auto;
            padding: 0 20px;
        }
        .c-pricing-label {
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--accent);
            margin-bottom: 12px;
        }
        .c-pricing-heading {
            font-family: var(--font-serif);
            font-size: 36px;
            font-weight: 400;
            line-height: 1.15;
            margin-bottom: 40px;
        }
        .c-pricing-grid {
            display: grid;
            gap: 16px;
        }
        .c-price-card {
            border: 1px solid var(--gray-200);
            border-radius: 16px;
            padding: 28px 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            transition: border-color 0.2s;
        }
        .c-price-card:hover { border-color: var(--gray-400); }
        .c-price-card-featured {
            background: var(--black);
            color: var(--white);
            border-color: var(--black);
        }
        .c-price-card-featured:hover { border-color: var(--gray-700); }
        .c-price-card-name {
            font-weight: 600;
            font-size: 16px;
            margin-bottom: 2px;
        }
        .c-price-card-desc {
            font-size: 13px;
            color: var(--gray-500);
        }
        .c-price-card-featured .c-price-card-desc { color: rgba(255,255,255,0.5); }
        .c-price-card-right {
            text-align: right;
            flex-shrink: 0;
        }
        .c-price-card-amount {
            font-family: var(--font-serif);
            font-size: 28px;
            line-height: 1;
            margin-bottom: 6px;
        }
        .c-price-card-amount small {
            font-family: var(--font-body);
            font-size: 13px;
            font-weight: 400;
            opacity: 0.5;
        }
        .c-price-card-book {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            font-size: 12px;
            font-weight: 600;
            padding: 6px 16px;
            border-radius: 20px;
            text-decoration: none;
            border: none;
            transition: background 0.2s;
        }
        .c-price-card .c-price-card-book {
            background: var(--black);
            color: var(--white);
        }
        .c-price-card-featured .c-price-card-book {
            background: var(--white);
            color: var(--black);
        }

        /* ---- FEATURED TESTIMONIAL (C) ---- */
        .c-testimonial-featured {
            padding: 72px 0 48px;
            background: var(--cream);
        }
        .c-testimonial-featured-inner {
            max-width: 800px;
            margin: 0 auto;
            padding: 0 24px;
            text-align: center;
        }
        .c-quote-mark {
            font-family: var(--font-serif);
            font-size: 80px;
            line-height: 0.6;
            color: var(--warm-200);
            margin-bottom: 16px;
        }
        .c-quote-text {
            font-family: var(--font-serif);
            font-style: italic;
            font-size: 24px;
            line-height: 1.5;
            margin-bottom: 24px;
            color: var(--black);
        }
        .c-quote-attr {
            font-size: 13px;
            color: var(--gray-500);
            font-weight: 500;
        }
        .c-quote-attr strong {
            color: var(--black);
            font-weight: 600;
        }

        /* ---- REVIEWS (C) ---- */
        .c-reviews {
            padding: 0 0 64px;
            background: var(--cream);
        }
        .c-reviews-inner {
            max-width: 1000px;
            margin: 0 auto;
            padding: 0 20px;
        }
        .c-reviews-grid {
            display: grid;
            gap: 14px;
        }
        .c-review-card {
            background: var(--white);
            border-radius: 12px;
            padding: 22px 20px;
            border: 1px solid var(--warm-200);
        }
        .c-review-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 10px;
        }
        .c-review-author {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .c-review-avatar {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: var(--warm-100);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 600;
            font-size: 14px;
            color: var(--white);
            object-fit: cover;
        }
        .c-review-avatar img {
            width: 100%;
            height: 100%;
            border-radius: 50%;
            object-fit: cover;
        }
        .c-avatar-st { background: #6366f1; }
        .c-avatar-sw { background: #ec4899; }
        .c-avatar-sr { background: #8b5cf6; }
        .c-avatar-rs { background: #14b8a6; }
        .c-avatar-mm { background: #f59e0b; }
        .c-avatar-eg { background: #06b6d4; }
        .c-review-name {
            font-weight: 600;
            font-size: 14px;
        }
        .c-review-time {
            font-size: 12px;
            color: var(--gray-400);
        }
        .c-review-g {
            width: 20px;
            height: 20px;
            flex-shrink: 0;
        }
        .c-review-stars {
            display: flex;
            gap: 1px;
            margin-bottom: 8px;
        }
        .c-review-stars svg { width: 13px; height: 13px; fill: var(--star); }
        .c-review-text {
            font-size: 14px;
            line-height: 1.55;
            color: var(--gray-700);
        }

        /* ---- FAQ (C) ---- */
        .c-faq {
            padding: 48px 0 56px;
            background: var(--cream);
        }
        .c-faq-inner {
            max-width: 720px;
            margin: 0 auto;
            padding: 0 20px;
        }
        .c-faq-heading {
            font-family: var(--font-serif);
            font-size: 28px;
            font-weight: 400;
            margin-bottom: 24px;
        }
        .c-faq-item {
            border-bottom: 1px solid var(--warm-200);
        }
        .c-faq-q {
            width: 100%;
            text-align: left;
            background: none;
            border: none;
            padding: 16px 0;
            font-size: 15px;
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            color: var(--black);
        }
        .c-faq-q svg {
            width: 18px;
            height: 18px;
            flex-shrink: 0;
            transition: transform 0.25s;
            color: var(--gray-400);
        }
        .c-faq-q[aria-expanded="true"] svg { transform: rotate(180deg); }
        .c-faq-a {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease;
        }
        .c-faq-a-inner {
            padding: 0 0 16px;
            font-size: 14px;
            line-height: 1.65;
            color: var(--gray-600);
        }

        /* =============================================
           RESPONSIVE
           ============================================= */
        @media (min-width: 640px) {
            .c-reviews-grid { grid-template-columns: 1fr 1fr; }
        }

        @media (min-width: 768px) {
            body { padding-bottom: 0; }
            .b-sticky { display: none; }

            .b-hero h1 { font-size: 44px; }
            .b-hero-ctas { flex-direction: row; }

            .c-pricing { padding: 88px 0 96px; }
            .c-pricing-heading { font-size: 44px; }
            .c-pricing-grid { grid-template-columns: 1fr 1fr; }

            .b-ba-grid { grid-template-columns: 1fr 1fr 1fr; }

            .b-provider-card { flex-direction: row; align-items: flex-start; padding: 32px; }
            .b-provider-photo { width: 220px; flex-shrink: 0; aspect-ratio: 3/4; }

            .b-loc-grid { grid-template-columns: 1fr 1fr; }

            .c-testimonial-featured { padding: 96px 0 56px; }
            .c-quote-text { font-size: 32px; }
            .c-quote-mark { font-size: 100px; }
        }

        @media (min-width: 1024px) {
            .b-hero-grid {
                flex-direction: row;
                align-items: center;
                gap: 48px;
            }
            .b-hero-content { flex: 1; }
            .b-hero-photo { width: 400px; flex-shrink: 0; aspect-ratio: 3/4; }

            .b-hero h1 { font-size: 48px; }

            .b-section-title { font-size: 34px; }
            .b-final h2 { font-size: 38px; }

            .c-reviews-grid { grid-template-columns: 1fr 1fr 1fr; }
        }

        .sr-only {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0,0,0,0);
            border: 0;
        }

        .b-google-icon { width: 20px; height: 20px; flex-shrink: 0; }
    </style>

<!-- Boulevard Self-Booking overlay -->
  <script>
    (function (a) {
      var b = {
        businessId: 'f3b76135-4267-4bcb-ba3a-faa3b60f8c06',
        gaMeasurementId: 'G-XTX2CN9CP7',
      };
  
      var c = a.createElement('script');
      var d = a.querySelector('script');
  
      c.src = 'https://static.joinboulevard.com/injector.min.js';
      c.async = true;
      c.onload = function () {
        blvd.init(b);
      };
  
      d.parentNode.insertBefore(c, d);
    })(document);
  </script>
<!-- End Boulevard Self-Booking overlay -->
</head>
<body>
    

    <!-- ======== HEADER (B) ======== -->
    <header class="b-header">
        <div class="b-header-inner">
            <a href="#" class="b-logo" aria-label="Sarah Hitchcox Aesthetics">
                <div style="width: 34px; height: 34px;">
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 130.8 130.8">
							<path
								fill="currentColor"
								d="M130.8,65.4C130.8,29.3,101.5,0,65.4,0S0,29.3,0,65.4s29.3,65.4,65.4,65.4,65.4-29.2,65.4-65.4ZM8.2,44.3c-.3,2.1-.4,4.3-.2,6.4.6,5.7,2.8,10.7,6.4,15.3,4.6,5.8,9.7,9.2,15.4,10.3s11.4.7,16.9-1c.5-.2,1.1-.4,1.6-.5v18h3.8v-19.4c4.6-1.7,9.9-3.9,16-6.7,4.6-2.2,8.7-4,12.4-5.5v31.5h3.8v-33c1.3-.5,2.6-.9,3.7-1.3,5.2-1.7,10.4-2.1,15.5-1.3s9.7,3.8,13.8,8.9c5.2,6.5,6.6,15,4.8,20.7-.6,1.6-1.3,3.3-2.1,5.1-.4.8-.7,1.6-1.2,2.4,0,.1-.1.2-.1.2-10.3,19-30.4,31.8-53.5,31.8-33.7,0-60.9-27.3-60.9-60.9.1-7.3,1.5-14.4,3.9-21ZM126.2,65.5c0,3-.3,5.9-.7,8.8-1-3.8-2.8-7.3-5.3-10.4-4.5-5.7-9.6-9-15.1-10-5.6-1-11.2-.7-16.7,1-1.3.4-2.6.9-4,1.4v-17h-3.8v18.5c-4,1.5-8.4,3.4-13.5,5.7-5.7,2.6-10.7,4.7-14.9,6.4v-30.5h-3.8v31.9c-.5.2-1.1.4-1.5.5-5.3,1.7-10.5,2.1-15.7,1.3-5.2-.9-9.8-3.9-13.8-9-5.2-6.5-6.8-13.9-5-22.3,1.8-8,5.7-16.1,14.9-23.7,10.4-8.4,23.6-13.4,38-13.4,33.7-.1,60.9,27.1,60.9,60.8"
							/>
						</svg>
					</div>
                <div class="b-logo-text">
                    Sarah Hitchcox
                    <small>Aesthetics</small>
                </div>
            </a>
            <a href="${DEFAULT_BLVD_BOOKING_URL}" class="b-header-cta" target="_blank" rel="noopener">
                Schedule Now
            </a>
        </div>
    </header>

    <main>
        <!-- ======== HERO (B) ======== -->
        <section class="b-hero">
            <div class="container">
                <div class="b-hero-grid">
                    <div class="b-hero-content">
                        <div class="b-hero-badge">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                            RN-Administered · Knoxville
                        </div>

                        <h1>20% Off<br>Your First <span>Dysport Treatment</span></h1>
                        <p class="b-hero-price">New clients save <strong>20% on their first Dysport treatment</strong>. A smooth, airbrushed finish — naturally.</p>

                        <div class="b-hero-rating">
                            <div class="b-hero-rating-score">5.0</div>
                            <div>
                                <div class="b-stars" aria-label="5 out of 5 stars">
                                    <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                                    <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                                    <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                                    <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                                    <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                                </div>
                                <span class="b-hero-rating-label">217+ Five-Star Reviews</span>
                            </div>
                        </div>

                        <div class="b-hero-ctas">
                            <a href="${DEFAULT_BLVD_BOOKING_URL}" class="b-btn b-btn-dark" target="_blank" rel="noopener">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                Book Your Appointment
                            </a>
                            <a href="tel:8654261826" class="b-btn b-btn-light">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                                (865) 426-1826
                            </a>
                        </div>
                    </div>

                    <div class="b-hero-photo">
                        <img src="https://hitchcoxaesthetics.com/img/knoxville-med-spa.webp" alt="Sarah Hitchcox Aesthetics — Knoxville Med Spa" loading="eager">
                        <div class="b-hero-photo-badge">20% Off Your First Visit</div>
                    </div>
                </div>
            </div>
        </section>

        <!-- ======== SOCIAL PROOF BAR (B) ======== -->
        <div class="b-proof-bar">
            <div class="b-proof-inner">
                <div class="b-proof-item">
                    <svg viewBox="0 0 24 24" fill="var(--star)"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    5.0 Perfect Rating on Google
                </div>
                <div class="b-proof-divider"></div>
                <div class="b-proof-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    Registered Nurse Injector
                </div>
                <div class="b-proof-divider"></div>
                <div class="b-proof-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    2 Knoxville Locations
                </div>
                <div class="b-proof-divider"></div>
                <div class="b-proof-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    Quick 10-Min Treatments
                </div>
            </div>
        </div>

        <!-- ======== PRICING (C) ======== -->
        <section class="c-pricing">
            <div class="c-pricing-inner">
                <div class="c-pricing-label">Transparent Pricing</div>
                <h2 class="c-pricing-heading">No hidden fees.<br>No upselling. Just results.</h2>
                <p style="font-size:14px;color:var(--gray-500);margin-top:-16px;margin-bottom:28px;">Know exactly what you're paying before you walk in. That's how it should be.</p>
                <h3 style="font-family: var(--font-display); font-size: 24px; margin-bottom: 16px;">Our Services</h3>
<div class="c-pricing-grid" style="margin-bottom: 32px;">

                    <div class="c-price-card c-price-card-featured">
                        <div>
                            <div class="c-price-card-name">Dysport</div>
                            </div>
<h3 style="font-family: var(--font-display); font-size: 24px; margin-bottom: 16px;">New Patient Offers</h3>
<div class="c-pricing-grid">
<div class="c-price-card-desc">Smooth, airbrushed wrinkle relaxer</div>
                        </div>
                        <div class="c-price-card-right">
                            <div class="c-price-card-amount">\$13 <small>/unit</small></div>
                            <a href="${DEFAULT_BLVD_BOOKING_URL}" class="c-price-card-book">Book Now</a>
                        </div>
                    </div>
                    <div class="c-price-card" style="border: 2px solid var(--accent); background: var(--accent-bg);">
                        <div>
                            <div class="c-price-card-name">Jeuveau</div>
                            <div class="c-price-card-desc">Purpose-built for cosmetics</div>
                        </div>
                        <div class="c-price-card-right">
                            <div class="c-price-card-amount">\$13 <small>/unit</small></div>
                            <a href="${DEFAULT_BLVD_BOOKING_URL}" class="c-price-card-book">Book Now</a>
                        </div>
                    </div>
                    <div class="c-price-card">
                        <div>
                            <div class="c-price-card-name" style="color: var(--accent)">First Visit Special</div>
                            <div class="c-price-card-desc">20% off any treatment</div>
                        </div>
                        <div class="c-price-card-right">
                            <div class="c-price-card-amount" style="color:var(--accent)">20% Off</div>
                            <a href="${DEFAULT_BLVD_BOOKING_URL}" class="c-price-card-book">Book Now</a>
                        </div>
                    </div>
                    <div class="c-price-card">
                        <div>
                            <div class="c-price-card-name">Free Consultation</div>
                            <div class="c-price-card-desc">Personalized treatment plan</div>
                        </div>
                        <div class="c-price-card-right">
                            <div class="c-price-card-amount">Free</div>
                            <a href="${DEFAULT_BLVD_BOOKING_URL}" class="c-price-card-book">Book Now</a>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- ======== BEFORE/AFTER (B layout, Pexels images, Treatment/Results labels) ======== -->
        <section class="b-results">
            <div class="container">
                <p class="b-section-label">Real Results</p>
                <h2 class="b-section-title">Real Dysport Results</h2>
                <p class="b-section-sub">Real patients, real results — smooth, natural-looking skin.</p>

                <div class="b-ba-grid">
                    <div>
                        <div class="b-ba-pair">
                            <div class="b-ba-img"><img src="https://hitchcoxaesthetics.com/img/before-after/botox-crows-feet-001-before.webp" alt="Before crow's feet treatment" loading="lazy"><span class="b-ba-tag">Before</span></div>
                            <div class="b-ba-img"><img src="https://hitchcoxaesthetics.com/img/before-after/botox-crows-feet-001-after.webp" alt="After crow's feet treatment" loading="lazy"><span class="b-ba-tag">After</span></div>
                        </div>
                        <p class="b-ba-label">Crow's Feet</p>
                    </div>
                    <div>
                        <div class="b-ba-pair">
                            <div class="b-ba-img"><img src="https://hitchcoxaesthetics.com/img/before-after/botox-forehead-lines-001-before.webp" alt="Before forehead lines treatment" loading="lazy"><span class="b-ba-tag">Before</span></div>
                            <div class="b-ba-img"><img src="https://hitchcoxaesthetics.com/img/before-after/botox-forehead-lines-001-after.webp" alt="After forehead lines treatment" loading="lazy"><span class="b-ba-tag">After</span></div>
                        </div>
                        <p class="b-ba-label">Forehead Lines</p>
                    </div>
                    <div>
                        <div class="b-ba-pair">
                            <div class="b-ba-img"><img src="https://hitchcoxaesthetics.com/img/before-after/botox-frown-lines-001-before.webp" alt="Before frown lines treatment" loading="lazy"><span class="b-ba-tag">Before</span></div>
                            <div class="b-ba-img"><img src="https://hitchcoxaesthetics.com/img/before-after/botox-frown-lines-001-after.webp" alt="After frown lines treatment" loading="lazy"><span class="b-ba-tag">After</span></div>
                        </div>
                        <p class="b-ba-label">Frown Lines</p>
                    </div>
                </div>

                <div class="b-results-cta">
                    <a href="${DEFAULT_BLVD_BOOKING_URL}" class="b-link" target="_blank" rel="noopener">Book Your Consultation &rarr;</a>
                </div>
            </div>
        </section>

        <!-- ======== FEATURED TESTIMONIAL (C) ======== -->
        <section class="c-testimonial-featured">
            <div class="c-testimonial-featured-inner">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px;">
                    <div style="display:flex;gap:2px;">
                        <svg viewBox="0 0 20 20" fill="#f59e0b" style="width:18px;height:18px"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg>
                        <svg viewBox="0 0 20 20" fill="#f59e0b" style="width:18px;height:18px"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg>
                        <svg viewBox="0 0 20 20" fill="#f59e0b" style="width:18px;height:18px"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg>
                        <svg viewBox="0 0 20 20" fill="#f59e0b" style="width:18px;height:18px"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg>
                        <svg viewBox="0 0 20 20" fill="#f59e0b" style="width:18px;height:18px"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg>
                    </div>
                    <span style="font-size:14px;font-weight:600;color:var(--gray-700);">217+ Five-Star Reviews on Google</span>
                </div>
                <div class="c-quote-mark">&ldquo;</div>
                <p class="c-quote-text">She is a true artist! Incredibly gentle, thorough and professional. Extremely knowledgeable &amp; knows everything there is to know about medical aesthetics. Happy is an understatement.</p>
                <p class="c-quote-attr"><strong>Sarah Webb</strong> &mdash; Local Guide &middot; Google Review</p>
            </div>
        </section>

        <!-- ======== REVIEW CARDS (C) ======== -->
        <section class="c-reviews">
            <div class="c-reviews-inner">
                <div class="c-reviews-grid">
                    <div class="c-review-card">
                        <div class="c-review-top">
                            <div class="c-review-author">
                                <div class="c-review-avatar c-avatar-st">S</div>
                                <div>
                                    <div class="c-review-name">Shelby Thomas</div>
                                    <div class="c-review-time">A month ago</div>
                                </div>
                            </div>
                            <svg class="c-review-g" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                        </div>
                        <div class="c-review-stars">
                            <svg viewBox="0 0 20 20"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg><svg viewBox="0 0 20 20"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg><svg viewBox="0 0 20 20"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg><svg viewBox="0 0 20 20"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg><svg viewBox="0 0 20 20"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg>
                        </div>
                        <p class="c-review-text">Sarah did an amazing job with my Dysport. She's incredibly knowledgeable, took the time to explain everything, and made me feel completely at ease. The clinic space is cute and welcoming. I trust her fully with my face!</p>
                    </div>
                    <div class="c-review-card">
                        <div class="c-review-top">
                            <div class="c-review-author">
                                <div class="c-review-avatar c-avatar-sw">S</div>
                                <div>
                                    <div class="c-review-name">Sarah Webb</div>
                                    <div class="c-review-time">A month ago</div>
                                </div>
                            </div>
                            <svg class="c-review-g" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                        </div>
                        <div class="c-review-stars">
                            <svg viewBox="0 0 20 20"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg><svg viewBox="0 0 20 20"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg><svg viewBox="0 0 20 20"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg><svg viewBox="0 0 20 20"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg><svg viewBox="0 0 20 20"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg>
                        </div>
                        <p class="c-review-text">She is a true artist! Incredibly gentle, thorough and professional. She is extremely knowledgeable and knows everything there is to know about medical aesthetics. I highly recommend!</p>
                    </div>
                    <div class="c-review-card">
                        <div class="c-review-top">
                            <div class="c-review-author">
                                <div class="c-review-avatar c-avatar-eg">E</div>
                                <div>
                                    <div class="c-review-name">Emma Greene</div>
                                    <div class="c-review-time">2 weeks ago</div>
                                </div>
                            </div>
                            <svg class="c-review-g" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                        </div>
                        <div class="c-review-stars">
                            <svg viewBox="0 0 20 20"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg><svg viewBox="0 0 20 20"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg><svg viewBox="0 0 20 20"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg><svg viewBox="0 0 20 20"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg><svg viewBox="0 0 20 20"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg>
                        </div>
                        <p class="c-review-text">Had a great first experience getting Jeuveau injected! I was in and out in less than 30 minutes. Sarah was super helpful and answered all my questions! I'll definitely be back!</p>
                    </div>
                    <div class="c-review-card">
                        <div class="c-review-top">
                            <div class="c-review-author">
                                <div class="c-review-avatar c-avatar-sr">S</div>
                                <div>
                                    <div class="c-review-name">Shelli Rampold</div>
                                    <div class="c-review-time">A month ago</div>
                                </div>
                            </div>
                            <svg class="c-review-g" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                        </div>
                        <div class="c-review-stars">
                            <svg viewBox="0 0 20 20"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg><svg viewBox="0 0 20 20"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg><svg viewBox="0 0 20 20"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg><svg viewBox="0 0 20 20"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg><svg viewBox="0 0 20 20"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg>
                        </div>
                        <p class="c-review-text">Sarah is absolutely the best! I was nervous but the whole experience has been amazing. She takes her time to explain and makes sure you're comfortable. Could not recommend her more!</p>
                    </div>
                    <div class="c-review-card">
                        <div class="c-review-top">
                            <div class="c-review-author">
                                <div class="c-review-avatar c-avatar-rs">R</div>
                                <div>
                                    <div class="c-review-name">Rachel S</div>
                                    <div class="c-review-time">A month ago</div>
                                </div>
                            </div>
                            <svg class="c-review-g" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                        </div>
                        <div class="c-review-stars">
                            <svg viewBox="0 0 20 20"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg><svg viewBox="0 0 20 20"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg><svg viewBox="0 0 20 20"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg><svg viewBox="0 0 20 20"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg><svg viewBox="0 0 20 20"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg>
                        </div>
                        <p class="c-review-text">Sarah was super friendly and knowledgeable. She guided me towards the best plan of action and explained why. She even let me know about discounts via reward programs that could be applied to my treatments!</p>
                    </div>
                    <div class="c-review-card">
                        <div class="c-review-top">
                            <div class="c-review-author">
                                <div class="c-review-avatar c-avatar-mm">M</div>
                                <div>
                                    <div class="c-review-name">Meghan Martland</div>
                                    <div class="c-review-time">2 months ago</div>
                                </div>
                            </div>
                            <svg class="c-review-g" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                        </div>
                        <div class="c-review-stars">
                            <svg viewBox="0 0 20 20"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg><svg viewBox="0 0 20 20"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg><svg viewBox="0 0 20 20"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg><svg viewBox="0 0 20 20"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg><svg viewBox="0 0 20 20"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7l.94-5.49-4-3.9 5.53-.8z"/></svg>
                        </div>
                        <p class="c-review-text">Love love love Sarah! I am having great success with the laser hair removal. Technology has come so far — no pain! She's incredibly indulgent with her time and knowledge. Highly recommend!</p>
                    </div>
                </div>
            </div>
        </section>

        <!-- ======== YOUR PROVIDER (B) ======== -->
        <section class="b-provider">
            <div class="container">
                <div class="b-provider-card">
                    <div class="b-provider-photo"><img src="https://hitchcoxaesthetics.com/img/sarah.jpg" alt="Sarah Hitchcox, RN" loading="lazy"></div>
                    <div>
                        <p class="b-section-label">Your Provider</p>
                        <h2 class="b-provider-name">Sarah Hitchcox, RN</h2>
                        <p class="b-provider-cred">Registered Nurse · Aesthetic Injector · DNP Candidate</p>
                        <p class="b-provider-bio">With a background in emergency nursing, Sarah brings precision and an eye for detail to every injection. Her philosophy? Subtle enhancements that let you look like the best version of yourself — refreshed, confident, and completely natural.</p>
                        <a href="${DEFAULT_BLVD_BOOKING_URL}" class="b-btn b-btn-dark" target="_blank" rel="noopener" style="display:inline-flex;">
                            Book with Sarah
                        </a>
                    </div>
                </div>
            </div>
        </section>

        <!-- ======== FAQ (C) ======== -->
        <section class="c-faq">
            <div class="c-faq-inner">
                <h2 class="c-faq-heading">Common questions</h2>

                <div class="c-faq-item">
                    <button class="c-faq-q" aria-expanded="false" onclick="toggleFaq(this)">
                        What is Dysport?
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path d="M19 9l-7 7-7-7"/></svg>
                    </button>
                    <div class="c-faq-a">
                        <div class="c-faq-a-inner">Dysport is an FDA-approved neuromodulator that relaxes facial muscles to smooth wrinkles. It's known for spreading more evenly than other options, creating a smooth, airbrushed finish — especially on larger areas like the forehead.</div>
                    </div>
                </div>

                <div class="c-faq-item">
                    <button class="c-faq-q" aria-expanded="false" onclick="toggleFaq(this)">
                        How is Dysport different from Botox?
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path d="M19 9l-7 7-7-7"/></svg>
                    </button>
                    <div class="c-faq-a">
                        <div class="c-faq-a-inner">Dysport spreads more broadly across the treatment area, which makes it particularly effective for larger zones like the forehead. Many patients notice results in as little as 2-3 days, and some report results lasting slightly longer than Botox.</div>
                    </div>
                </div>

                <div class="c-faq-item">
                    <button class="c-faq-q" aria-expanded="false" onclick="toggleFaq(this)">
                        Does Dysport hurt?
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path d="M19 9l-7 7-7-7"/></svg>
                    </button>
                    <div class="c-faq-a">
                        <div class="c-faq-a-inner">The needles are ultra-fine and the treatment takes just 10-20 minutes. Most patients describe a mild pinch. No downtime — you can return to normal activities immediately.</div>
                    </div>
                </div>

                <div class="c-faq-item">
                    <button class="c-faq-q" aria-expanded="false" onclick="toggleFaq(this)">
                        How long do Dysport results last?
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path d="M19 9l-7 7-7-7"/></svg>
                    </button>
                    <div class="c-faq-a">
                        <div class="c-faq-a-inner">Results typically last 3-4 months, with some patients experiencing slightly longer results compared to other neuromodulators. Regular treatments can help maintain consistent results.</div>
                    </div>
                </div>

                <div class="c-faq-item">
                    <button class="c-faq-q" aria-expanded="false" onclick="toggleFaq(this)">
                        What areas does Dysport treat?
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path d="M19 9l-7 7-7-7"/></svg>
                    </button>
                    <div class="c-faq-a">
                        <div class="c-faq-a-inner">Dysport excels at treating forehead lines, frown lines between the eyebrows, and crow's feet. Its natural spreading properties make it ideal for creating a smooth, even look across larger treatment zones.</div>
                    </div>
                </div>

                <div class="c-faq-item">
                    <button class="c-faq-q" aria-expanded="false" onclick="toggleFaq(this)">
                        What does Dysport cost?
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path d="M19 9l-7 7-7-7"/></svg>
                    </button>
                    <div class="c-faq-a">
                        <div class="c-faq-a-inner">Dysport is \$13 per unit. The total cost depends on how many units your treatment areas need. New clients get 20% off their first visit. Sarah will go over your personalized plan during a free consultation.</div>
                    </div>
                </div>
            </div>
        </section>

        <!-- ======== LOCATIONS (B) ======== -->
        <section class="b-locations">
            <div class="container">
                <p class="b-section-label">Visit Us</p>
                <h2 class="b-section-title">Two Knoxville Locations</h2>
                <p class="b-section-sub" style="margin-bottom:28px;">Choose whichever is most convenient for you.</p>

                <div class="b-loc-grid">
                    <div class="b-loc-card">
                        <h3 class="b-loc-name">Bearden</h3>
                        <p class="b-loc-address">5113 Kingston Pike, Suite 15<br>Knoxville, TN 37919</p>
                        <div class="b-loc-actions">
                            <a href="https://maps.google.com/?q=5113+Kingston+Pike+Suite+15+Knoxville+TN+37919" class="b-loc-link" target="_blank" rel="noopener">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                                Directions
                            </a>
                            <a href="${DEFAULT_BLVD_BOOKING_URL}" class="b-loc-link" target="_blank" rel="noopener">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                Book Here
                            </a>
                        </div>
                    </div>
                    <div class="b-loc-card">
                        <h3 class="b-loc-name">Farragut</h3>
                        <p class="b-loc-address">102 S Campbell Station Rd, Suite 8<br>Farragut, TN 37934</p>
                        <div class="b-loc-actions">
                            <a href="https://maps.google.com/?q=102+S+Campbell+Station+Rd+Suite+8+Farragut+TN+37934" class="b-loc-link" target="_blank" rel="noopener">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                                Directions
                            </a>
                            <a href="${DEFAULT_BLVD_BOOKING_URL}" class="b-loc-link" target="_blank" rel="noopener">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                Book Here
                            </a>
                        </div>
                    </div>
                </div>

                <div class="b-map">
                    <iframe
							src="https://maps.google.com/maps?width=100%25&amp;height=600&amp;hl=en&amp;q=Sarah%20Hitchcox%20Aesthetics,%20Knoxville,%20TN&amp;t=&amp;z=13&amp;ie=UTF8&amp;iwloc=B&amp;output=embed"
							allowfullscreen
							loading="lazy"
						></iframe>
                </div>
            </div>
        </section>
    </main>

    <!-- ======== FINAL CTA (B) ======== -->
    <section class="b-final">
        <div class="container">
            <div class="b-final-stars" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            </div>
            <h2>Ready for Smoother Skin?</h2>
            <p>New clients get 20% off their first Dysport treatment. Book your appointment today.</p>
            <div class="b-final-ctas">
                <a href="${DEFAULT_BLVD_BOOKING_URL}" class="b-btn-white" target="_blank" rel="noopener">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    Book Your Appointment
                </a>
                <a href="tel:8654261826" class="b-btn-ghost">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    (865) 426-1826
                </a>
            </div>
        </div>
    </section>

    <!-- ======== FOOTER (B) ======== -->
    <footer class="b-footer">
        <div class="container">
            <div style="margin-bottom:8px;font-weight:500;color:rgba(255,255,255,0.5);">Sarah Hitchcox Aesthetics</div>
            <div style="margin-bottom:8px;line-height:1.7;">
                Bearden: 5113 Kingston Pike, Suite 15, Knoxville, TN 37919<br>
                Farragut: 102 S Campbell Station Rd, Suite 8, Farragut, TN 37934
            </div>
            <div><a href="tel:8654261826">(865) 426-1826</a> · <a href="mailto:sarah@hitchcoxaesthetics.com">sarah@hitchcoxaesthetics.com</a></div>
            <div style="margin-top:12px;font-size:12px;">&copy; 2026 Sarah Hitchcox Aesthetics. All rights reserved.</div>
        </div>
    </footer>

    <!-- ======== MOBILE STICKY BAR (B) ======== -->
    <div class="b-sticky">
        <a href="${DEFAULT_BLVD_BOOKING_URL}" class="b-sticky-book" target="_blank" rel="noopener">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Book Online
        </a>
        <a href="tel:8654261826" class="b-sticky-call">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            Call Now
        </a>
    </div>

    <!-- ======== JAVASCRIPT ======== -->
    <script>
        // FAQ Accordion (C-style)
        function toggleFaq(btn) {
            const item = btn.parentElement;
            const answer = btn.nextElementSibling;
            const isOpen = btn.getAttribute('aria-expanded') === 'true';

            // Close all others
            document.querySelectorAll('.c-faq-q').forEach(function(q) {
                q.setAttribute('aria-expanded', 'false');
                q.nextElementSibling.style.maxHeight = null;
            });

            // Toggle clicked
            if (!isOpen) {
                btn.setAttribute('aria-expanded', 'true');
                answer.style.maxHeight = answer.scrollHeight + 'px';
            }
        }
    </script>
</body>
</html>
`
