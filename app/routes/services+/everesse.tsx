import { type MetaFunction } from '@remix-run/node'
import {
	ServiceAreas,
	ServiceCheckMarks,
	ServiceFAQ,
	ServiceHeader,
	ServiceLayout,
	ServiceParagraph,
} from './__service-layout'

export const meta: MetaFunction = () => [
	{
		title:
			'Everesse Skin Tightening | Knoxville and Farragut | Sarah Hitchcox Aesthetics',
	},
]

const areas = [
	{
		name: 'Jawline + Jowls',
		description:
			'Define and lift the jawline while softening jowls for a sharper profile.',
	},
	{
		name: 'Cheeks',
		description:
			'Restore mid‑face volume appearance and a subtle lift for a refreshed look.',
	},
	{
		name: 'Neck',
		description:
			'Tighten laxity and improve skin texture across the front and sides of the neck.',
	},
	{
		name: 'Nasolabial + Marionette',
		description:
			'Support adjacent tissue to reduce the look of folds and lines around the mouth.',
	},
	{
		name: 'Lower Face',
		description:
			'Comprehensive contouring focus for the perioral area, chin, and jawline.',
	},
]

const benefits = [
	{
		title: 'Non‑surgical',
		description:
			'No incisions, no anesthesia, and minimal downtime so you can get back to life fast.',
	},
	{
		title: 'Comfort‑first cooling',
		description:
			'Continuous water‑cooling helps protect the skin surface while delivering therapeutic heat where it matters.',
	},
	{
		title: 'Visible lift',
		description:
			'Targets cheek, jawline, and lower face laxity to create a firmer, more contoured appearance.',
	},
	{
		title: 'Quick appointments',
		description:
			'Most treatments take 30–60 minutes depending on areas treated.',
	},
	{
		title: 'Builds over weeks',
		description:
			'Results improve as your skin remodels, with best outcomes typically at 12 weeks.',
	},
]

const faq = [
	{
		question: 'What is Everesse?',
		answer:
			'Everesse is a non‑invasive skin tightening treatment that delivers focused radiofrequency energy below the skin surface while actively cooling the epidermis. The heat stimulates remodeling for a firmer, lifted look over time.',
	},
	{
		question: 'What does it feel like?',
		answer:
			'Most clients describe a warm sensation with brief heat pulses. Thanks to active cooling, comfort is high and anesthetic is usually unnecessary.',
	},
	{
		question: 'How many sessions will I need?',
		answer:
			'Many see improvement after a single session, with optimal plans ranging from 1–3 sessions spaced 4–6 weeks apart depending on goals and skin baseline.',
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
			'You may notice early tightening in 2–4 weeks, with peak improvements around 12 weeks as new collagen matures. Results vary by age and lifestyle; maintenance sessions can help sustain outcomes.',
	},
	{
		question: 'Event special',
		answer:
			'Join our Everesse Launch Event for 20% off packages purchased at the event. Limited spots. RSVP required.',
	},
]

export default function () {
	return (
		<ServiceLayout
			title="Everesse Non‑Surgical Skin Tightening"
			description="lift, tighten, and refine the lower face, jawline, cheeks, and neck"
			imgClassName="w-full h-full object-cover object-[50%_35%] sm:object-center"
		>
			<div className="w-full max-w-2xl space-y-8">
				{/* <div className="rounded-2xl border p-4 sm:p-6">
					<p className="text-sm uppercase tracking-wide">Launch Event</p>
					<p className="text-2xl font-semibold">20% Off For Attendees</p>
					<p className="text-sm">
						Friday, Sept 12 • 6–8 PM • Sarah Hitchcox Aesthetics • RSVP to hold
						your spot
					</p>
				</div> */}

				<ServiceParagraph>
					Everesse tightens and lifts where laxity shows first. Using
					comfort‑first cooling with targeted radiofrequency, it warms deeper
					tissues to trigger remodeling while keeping the surface skin comfy.
					Appointments are quick, results build over weeks, and the outcome is a
					firmer, more contoured look without surgery.
				</ServiceParagraph>

				<ServiceHeader>Benefits</ServiceHeader>
				<ServiceCheckMarks bulletPoints={benefits} />

				<ServiceHeader>Popular Treatment Areas</ServiceHeader>
				<ServiceAreas areas={areas} />

				<ServiceHeader>What To Expect</ServiceHeader>
				<ServiceParagraph>
					We start with photos and a focused consultation to map your goals. The
					handpiece glides with a cooling gel as we deliver controlled heat in
					passes. Most visits wrap in 30–60 minutes. Expect a healthy glow the
					same day, with firmer contours emerging over the next 4–12 weeks.
				</ServiceParagraph>

				<ServiceHeader>FAQ</ServiceHeader>
				<ServiceFAQ faq={faq} />
			</div>
		</ServiceLayout>
	)
}
